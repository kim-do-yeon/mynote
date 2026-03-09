/**
 * IndexedDB 기반 녹음 데이터 영구 저장소
 *
 * 녹음 완료 후 오디오 데이터를 IndexedDB에 저장하여
 * 브라우저 탭 종료, 와이파이 끊김, 갑작스러운 중단 시에도
 * 녹음 데이터를 보존하고 이어서 처리할 수 있도록 합니다.
 */

const DB_NAME = "mynote-recording";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

/** 처리 실패 단계 */
export type FailedStep = "transcribing" | "summarizing" | null;

/** IndexedDB에 저장되는 녹음 세션 데이터 */
export interface RecordingSession {
  /** 세션 고유 ID (projectId 기반) */
  id: string;
  /** 프로젝트 ID */
  projectId: string;
  /** 녹음된 1초 단위 raw data chunks (MediaRecorder 출력) */
  rawChunks: Blob[];
  /** MIME 타입 */
  mimeType: string;
  /** 오디오 포맷 (ogg, m4a, webm) */
  audioFormat: string;
  /** 녹음 시간 (초) */
  duration: number;
  /** 분할된 오디오 블롭 배열 (처리 시작 후 저장) */
  audioBlobs: Blob[];
  /** 파일 확장자 */
  ext: string;
  /** 청크별 전사 결과 */
  transcripts: string[];
  /** 통합 전사 텍스트 */
  fullTranscript: string;
  /** 실패한 단계 */
  failedStep: FailedStep;
  /** 실패한 청크 인덱스 (하위 호환용) */
  failedChunkIndex: number;
  /** 완료된 청크 인덱스 배열 (병렬 처리 시 비순차 완료 추적) */
  completedChunks: number[];
  /** 세션 생성 시각 */
  createdAt: number;
  /** 마지막 업데이트 시각 */
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 녹음 세션 저장 (전체 덮어쓰기) */
export async function saveSession(session: RecordingSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({
      ...session,
      updatedAt: Date.now(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** 특정 프로젝트의 녹음 세션 조회 */
export async function getSession(
  projectId: string
): Promise<RecordingSession | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(`session-${projectId}`);
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/** 특정 프로젝트의 녹음 세션 삭제 */
export async function deleteSession(projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(`session-${projectId}`);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** 세션의 특정 필드만 부분 업데이트 */
export async function updateSession(
  projectId: string,
  updates: Partial<Omit<RecordingSession, "id" | "projectId">>
): Promise<void> {
  const existing = await getSession(projectId);
  if (!existing) return;

  await saveSession({
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  });
}

/** 오래된 세션 정리 (24시간 이상) */
export async function cleanupOldSessions(): Promise<void> {
  const db = await openDB();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const session = cursor.value as RecordingSession;
        if (session.updatedAt < cutoff) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** 세션 ID 생성 헬퍼 */
export function sessionId(projectId: string): string {
  return `session-${projectId}`;
}
