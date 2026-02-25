/**
 * 클라이언트 사이드 오디오 분할 유틸리티
 *
 * 핵심 전략:
 * MediaRecorder의 1초 단위 data chunk를 점진적으로 합치면서
 * base64 크기가 Vercel body limit(4.5MB)을 넘기 전에 끊어서 분할합니다.
 *
 * 시간 기반이 아닌 **크기 기반 분할**로 안정적으로 동작합니다.
 */

/**
 * Vercel Serverless Function의 request body 제한은 4.5MB.
 * JSON 구조의 오버헤드를 고려하여 base64 데이터는 3MB 이하로 유지.
 * base64 인코딩은 원본 대비 약 1.37배이므로,
 * 원본 Blob 크기 기준으로 약 2.2MB 이하로 자릅니다.
 */
const MAX_CHUNK_BLOB_BYTES = 2.2 * 1024 * 1024; // ~2.2MB Blob → ~3MB base64

/** Blob → base64 문자열 변환 (FileReader 사용, 대용량 안전) */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
    // 현재 그룹에 이 chunk를 추가하면 초과하는지 확인
    if (currentSize + chunk.size > MAX_CHUNK_BLOB_BYTES && currentGroup.length > 0) {
      // 현재 그룹을 확정하고 새 그룹 시작
      groups.push(new Blob(currentGroup, { type: mimeType }));
      currentGroup = [];
      currentSize = 0;
    }
    currentGroup.push(chunk);
    currentSize += chunk.size;
  }

  // 마지막 그룹
  if (currentGroup.length > 0) {
    groups.push(new Blob(currentGroup, { type: mimeType }));
  }

  return groups;
}

/**
 * 녹음 데이터를 분할이 필요한지 판단.
 * 전체 오디오 Blob 크기가 MAX_CHUNK_BLOB_BYTES를 초과하면 분할.
 */
export function needsChunking(dataChunks: Blob[]): boolean {
  const totalSize = dataChunks.reduce((sum, chunk) => sum + chunk.size, 0);
  return totalSize > MAX_CHUNK_BLOB_BYTES;
}

/**
 * fetch 응답에서 에러 메시지를 안전하게 추출.
 * JSON 파싱 실패 시 텍스트로 폴백.
 */
export async function safeParseErrorResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json.error || json.message || `서버 오류 (${res.status})`;
    } catch {
      // JSON이 아닌 경우 (예: "Request Entity Too Large")
      if (
        text.toLowerCase().includes("request entity too large") ||
        text.toLowerCase().includes("body exceeded") ||
        text.toLowerCase().includes("body limit") ||
        text.toLowerCase().includes("payload too large") ||
        res.status === 413
      ) {
        return "요청 데이터가 너무 큽니다. 녹음 시간을 줄여주세요.";
      }
      return text.substring(0, 200) || `서버 오류 (${res.status})`;
    }
  } catch {
    return `서버 오류 (${res.status})`;
  }
}

export { MAX_CHUNK_BLOB_BYTES };
