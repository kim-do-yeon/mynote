/**
 * 클라이언트 사이드 오디오 분할 유틸리티
 *
 * 핵심 전략:
 * 1. MediaRecorder의 1초 단위 data chunk를 크기 기반으로 그룹화
 * 2. 각 그룹을 FormData(multipart)로 전송 → base64 오버헤드 제거
 * 3. Vercel body limit(4.5MB) 안에서 최대한 큰 chunk 전송
 *
 * FormData는 binary를 그대로 전송하므로 base64(+33%) 대비 효율적.
 * 안전 마진을 두고 chunk당 Blob 크기를 3.5MB 이하로 제한.
 */

/**
 * Vercel Serverless Function의 request body 제한: 4.5MB
 * FormData 멀티파트 오버헤드(boundary, headers 등) 약 수백 바이트 고려
 * → Blob 자체는 3.5MB 이하로 제한하면 충분히 안전
 */
const MAX_CHUNK_BLOB_BYTES = 1 * 1024 * 1024; // 1MB — 안전하게 Vercel 4.5MB 한도 이내

/**
 * 1초 단위 data chunk 배열을 크기 기반으로 Blob 배열로 묶기.
 * 각 그룹의 총 byte가 MAX_CHUNK_BLOB_BYTES를 넘지 않도록 합니다.
 */
export function groupDataChunks(
  dataChunks: Blob[],
  mimeType: string
): Blob[] {
  const groups: Blob[] = [];
  let currentGroup: Blob[] = [];
  let currentSize = 0;

  for (const chunk of dataChunks) {
    if (
      currentSize + chunk.size > MAX_CHUNK_BLOB_BYTES &&
      currentGroup.length > 0
    ) {
      groups.push(new Blob(currentGroup, { type: mimeType }));
      currentGroup = [];
      currentSize = 0;
    }
    currentGroup.push(chunk);
    currentSize += chunk.size;
  }

  if (currentGroup.length > 0) {
    groups.push(new Blob(currentGroup, { type: mimeType }));
  }

  return groups;
}

/**
 * fetch 응답에서 에러 메시지를 안전하게 추출.
 * Vercel이 JSON이 아닌 텍스트("Request Entity Too Large")를 반환할 수 있으므로
 * 반드시 text()로 먼저 읽고 JSON 파싱을 시도합니다.
 */
export async function safeParseErrorResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json.error || json.message || `서버 오류 (${res.status})`;
    } catch {
      if (
        text.toLowerCase().includes("request entity too large") ||
        text.toLowerCase().includes("body exceeded") ||
        text.toLowerCase().includes("body limit") ||
        text.toLowerCase().includes("payload too large") ||
        res.status === 413
      ) {
        return "요청 데이터가 너무 큽니다 (Vercel 4.5MB 제한 초과). 자동으로 더 작게 분할해야 합니다.";
      }
      return text.substring(0, 200) || `서버 오류 (${res.status})`;
    }
  } catch {
    return `서버 오류 (${res.status})`;
  }
}

/**
 * fetch 응답을 안전하게 JSON으로 파싱.
 * Vercel/CDN이 비표준 응답(텍스트, HTML 등)을 반환할 수 있으므로
 * 항상 text()로 먼저 읽고 JSON.parse를 시도합니다.
 */
export async function safeParseJson<T = Record<string, unknown>>(
  res: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const text = await res.text();

  // HTTP 에러인 경우
  if (!res.ok) {
    try {
      const json = JSON.parse(text);
      return {
        ok: false,
        error: json.error || json.message || `서버 오류 (${res.status})`,
        status: res.status,
      };
    } catch {
      if (
        text.toLowerCase().includes("request entity too large") ||
        text.toLowerCase().includes("body exceeded") ||
        text.toLowerCase().includes("body limit") ||
        text.toLowerCase().includes("payload too large") ||
        res.status === 413
      ) {
        return {
          ok: false,
          error: "요청 데이터가 너무 큽니다 (Vercel 4.5MB 제한 초과)",
          status: 413,
        };
      }
      return {
        ok: false,
        error: text.substring(0, 200) || `서버 오류 (${res.status})`,
        status: res.status,
      };
    }
  }

  // HTTP 성공이지만 body가 JSON이 아닐 수 있음
  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: `서버가 잘못된 응답을 반환했습니다: ${text.substring(0, 100)}`,
      status: res.status,
    };
  }
}

/** 바이트를 사람이 읽기 편한 단위로 변환 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export { MAX_CHUNK_BLOB_BYTES };
