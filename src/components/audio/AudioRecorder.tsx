"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useTimer } from "@/hooks/useTimer";
import RecordingIndicator from "./RecordingIndicator";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import {
  groupDataChunks,
  safeParseJson,
  formatBytes,
} from "@/lib/audio-chunker";
import {
  type RecordingSession,
  type FailedStep,
  saveSession,
  getSession,
  deleteSession,
  updateSession,
  cleanupOldSessions,
  sessionId,
} from "@/lib/recording-store";
import { TranscribeResponse } from "@/types";

const MAX_RECORDING_SECONDS = 80 * 60; // 80분
const MAX_RETRIES = 3; // 청크/요약 실패 시 최대 재시도 횟수
const RETRY_BASE_DELAY_MS = 2000; // 재시도 기본 대기시간 (지수 백오프)
const CONCURRENCY = 8; // 동시 처리 수 (Vercel Hobby 10개 한도 내 여유분 확보)

/** 지수 백오프 대기 */
function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 동시성 제한 병렬 처리 (Promise pool 패턴).
 * 최대 concurrency개의 작업을 동시에 실행하며,
 * 하나가 실패하면 새 작업을 시작하지 않고 진행 중인 작업은 완료를 기다림.
 */
async function pMap<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let nextIndex = 0;
  let hasError: Error | null = null;

  async function worker() {
    while (nextIndex < items.length && !hasError) {
      const i = nextIndex++;
      try {
        await fn(items[i]);
      } catch (err) {
        if (!hasError) {
          hasError = err instanceof Error ? err : new Error(String(err));
        }
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  if (hasError) throw hasError;
}

type ProcessingState =
  | "idle"
  | "recording"
  | "preview"
  | "processing"
  | "completed"
  | "error";

interface AudioRecorderProps {
  projectId: string;
}

interface ChunkProgress {
  totalChunks: number;
  completedChunks: number;
  currentStep: "chunking" | "transcribing" | "summarizing";
}

/** 페이지 진입 시 발견된 복구 가능 세션 정보 */
interface RecoveryInfo {
  session: RecordingSession;
  audioBlobUrl: string;
}

function getExtFromMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("webm")) return "webm";
  return "webm";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function AudioRecorder({ projectId }: AudioRecorderProps) {
  const router = useRouter();
  const {
    status: recorderStatus,
    startRecording,
    stopRecording,
    audioBase64,
    audioBlobUrl,
    audioFormat,
    actualMimeType,
    audioSizeKB,
    dataChunks,
    error: recorderError,
    reset: resetRecorder,
  } = useAudioRecorder();
  const timer = useTimer();

  const [state, setState] = useState<ProcessingState>("idle");
  const [processingMessage, setProcessingMessage] = useState("");
  const [result, setResult] = useState<TranscribeResponse | null>(null);
  const [error, setError] = useState("");
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(
    null
  );
  const [processLogs, setProcessLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // ★ 실패 시 보존하는 처리 상태 (메모리)
  const savedAudioBlobsRef = useRef<Blob[]>([]);
  const savedTranscriptsRef = useRef<string[]>([]);
  const savedExtRef = useRef<string>("");
  const savedFullTranscriptRef = useRef<string>("");
  const failedStepRef = useRef<FailedStep>(null);
  const failedChunkIndexRef = useRef<number>(0);

  // ★ IndexedDB 복구 세션 상태
  const [recoveryInfo, setRecoveryInfo] = useState<RecoveryInfo | null>(null);
  const [checkingRecovery, setCheckingRecovery] = useState(true);

  // 복구에 사용할 raw chunks (IndexedDB에서 로드된 것)
  const recoveredRawChunksRef = useRef<Blob[]>([]);
  const recoveredMimeTypeRef = useRef<string>("");
  const recoveredAudioFormatRef = useRef<string>("");
  const recoveredDurationRef = useRef<number>(0);

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString("ko-KR");
    setProcessLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [processLogs]);

  // ★ 페이지 진입 시 IndexedDB에서 미완료 세션 확인
  useEffect(() => {
    async function checkRecovery() {
      try {
        await cleanupOldSessions();
        const session = await getSession(projectId);
        if (session && session.rawChunks.length > 0) {
          // 재생용 URL 생성
          const combinedBlob = new Blob(session.rawChunks, {
            type: session.mimeType,
          });
          const blobUrl = URL.createObjectURL(combinedBlob);
          setRecoveryInfo({ session, audioBlobUrl: blobUrl });
        }
      } catch {
        // IndexedDB 접근 실패 시 무시
      } finally {
        setCheckingRecovery(false);
      }
    }
    checkRecovery();
  }, [projectId]);

  const handleStart = async () => {
    // 새 녹음 시작 → 이전 복구 데이터 정리
    if (recoveryInfo) {
      URL.revokeObjectURL(recoveryInfo.audioBlobUrl);
      setRecoveryInfo(null);
    }
    await deleteSession(projectId).catch(() => {});

    setState("recording");
    setError("");
    setProcessLogs([]);
    clearSavedState();
    timer.start();
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
    timer.stop();
  };

  /** 보존된 처리 상태 초기화 (메모리만) */
  const clearSavedState = () => {
    savedAudioBlobsRef.current = [];
    savedTranscriptsRef.current = [];
    savedExtRef.current = "";
    savedFullTranscriptRef.current = "";
    failedStepRef.current = null;
    failedChunkIndexRef.current = 0;
  };

  // ★ 녹음 완료 시 IndexedDB에 raw 오디오 데이터 저장
  useEffect(() => {
    if (recorderStatus === "stopped" && dataChunks.length > 0 && state === "recording") {
      // IndexedDB에 저장 (비동기, 실패해도 UI는 진행)
      saveSession({
        id: sessionId(projectId),
        projectId,
        rawChunks: dataChunks,
        mimeType: actualMimeType,
        audioFormat,
        duration: timer.seconds,
        audioBlobs: [],
        ext: "",
        transcripts: [],
        fullTranscript: "",
        failedStep: null,
        failedChunkIndex: 0,
        completedChunks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }).catch(() => {});
    }
  }, [recorderStatus, dataChunks, state, projectId, actualMimeType, audioFormat, timer.seconds]);

  /** 현재 녹음 데이터 또는 복구된 데이터로 처리 시작 */
  const handleProcess = async () => {
    // 현재 세션의 dataChunks 사용
    const chunks = dataChunks;
    const mime = actualMimeType;
    const format = audioFormat;

    if (chunks.length === 0) {
      setError("녹음 데이터가 없습니다. 다시 녹음해주세요.");
      setState("error");
      return;
    }

    setState("processing");
    setError("");
    setProcessLogs([]);
    clearSavedState();

    const totalRawSize = chunks.reduce((sum, c) => sum + c.size, 0);
    addLog(`녹음 데이터: ${chunks.length}개 조각, 총 ${formatBytes(totalRawSize)}`);

    try {
      setChunkProgress({ totalChunks: 0, completedChunks: 0, currentStep: "chunking" });
      setProcessingMessage("오디오를 분할하고 있습니다...");

      const audioBlobs = groupDataChunks(chunks, mime);
      const totalChunks = audioBlobs.length;
      const ext = getExtFromMime(mime);

      savedAudioBlobsRef.current = audioBlobs;
      savedExtRef.current = ext;

      // IndexedDB에 분할 결과 저장
      await updateSession(projectId, { audioBlobs, ext }).catch(() => {});

      addLog(`${totalChunks}개 구간으로 분할 완료`);
      for (let i = 0; i < totalChunks; i++) {
        addLog(`  구간 ${i + 1}: ${formatBytes(audioBlobs[i].size)}`);
      }

      await runTranscription(audioBlobs, ext, 0, mime, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
      setState("error");
    } finally {
      setChunkProgress(null);
    }
  };

  /** ★ 복구된 데이터로 처리 시작 (IndexedDB에서 로드) */
  const handleRecoveryProcess = async () => {
    if (!recoveryInfo) return;

    const session = recoveryInfo.session;
    const chunks = session.rawChunks;
    const mime = session.mimeType;
    const format = session.audioFormat;

    // 복구 데이터를 refs에 저장
    recoveredRawChunksRef.current = chunks;
    recoveredMimeTypeRef.current = mime;
    recoveredAudioFormatRef.current = format;
    recoveredDurationRef.current = session.duration;
    timer.setSeconds(session.duration);

    setState("processing");
    setError("");
    setProcessLogs([]);
    clearSavedState();
    setRecoveryInfo(null);

    const totalRawSize = chunks.reduce((sum, c) => sum + c.size, 0);
    addLog(`[복구] 녹음 데이터: ${chunks.length}개 조각, 총 ${formatBytes(totalRawSize)}`);

    try {
      // 이전 진행 상황이 있는 경우 이어서 처리
      if (session.failedStep && session.audioBlobs.length > 0) {
        savedAudioBlobsRef.current = session.audioBlobs;
        savedExtRef.current = session.ext;

        if (session.failedStep === "summarizing" && session.fullTranscript) {
          savedFullTranscriptRef.current = session.fullTranscript;
          addLog(`[복구] 전사 완료 상태 복원: ${session.fullTranscript.length}자`);
          addLog(`[복구] 요약 단계부터 재시도합니다.`);
          await runSummarization(session.fullTranscript, session.audioBlobs.length);
        } else if (session.failedStep === "transcribing") {
          savedTranscriptsRef.current = [...session.transcripts];
          const completed = session.completedChunks ?? [];
          const remaining = session.audioBlobs.length - completed.length;
          addLog(`[복구] ${completed.length}/${session.audioBlobs.length}개 구간 완료, ${remaining}개 구간 재시작`);
          await runTranscription(session.audioBlobs, session.ext, 0, mime, format, completed);
        }
      } else {
        // 진행 상황 없음 → 처음부터 처리
        setChunkProgress({ totalChunks: 0, completedChunks: 0, currentStep: "chunking" });
        setProcessingMessage("오디오를 분할하고 있습니다...");

        const audioBlobs = groupDataChunks(chunks, mime);
        const ext = getExtFromMime(mime);

        savedAudioBlobsRef.current = audioBlobs;
        savedExtRef.current = ext;

        await updateSession(projectId, { audioBlobs, ext }).catch(() => {});

        addLog(`${audioBlobs.length}개 구간으로 분할 완료`);
        await runTranscription(audioBlobs, ext, 0, mime, format);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
      setState("error");
    } finally {
      setChunkProgress(null);
    }
  };

  /** ★ 복구된 데이터로 처음부터 재처리 */
  const handleRecoveryProcessFromStart = async () => {
    if (!recoveryInfo) return;

    const session = recoveryInfo.session;
    const chunks = session.rawChunks;
    const mime = session.mimeType;
    const format = session.audioFormat;

    recoveredRawChunksRef.current = chunks;
    recoveredMimeTypeRef.current = mime;
    recoveredAudioFormatRef.current = format;
    recoveredDurationRef.current = session.duration;
    timer.setSeconds(session.duration);

    setState("processing");
    setError("");
    setProcessLogs([]);
    clearSavedState();
    setRecoveryInfo(null);

    // IndexedDB에서 진행 상태 초기화
    await updateSession(projectId, {
      audioBlobs: [],
      ext: "",
      transcripts: [],
      fullTranscript: "",
      failedStep: null,
      failedChunkIndex: 0,
      completedChunks: [],
    }).catch(() => {});

    const totalRawSize = chunks.reduce((sum, c) => sum + c.size, 0);
    addLog(`[복구] 녹음 데이터: ${chunks.length}개 조각, 총 ${formatBytes(totalRawSize)}`);
    addLog(`[복구] 처음부터 다시 처리합니다.`);

    try {
      setChunkProgress({ totalChunks: 0, completedChunks: 0, currentStep: "chunking" });
      setProcessingMessage("오디오를 분할하고 있습니다...");

      const audioBlobs = groupDataChunks(chunks, mime);
      const ext = getExtFromMime(mime);

      savedAudioBlobsRef.current = audioBlobs;
      savedExtRef.current = ext;

      await updateSession(projectId, { audioBlobs, ext }).catch(() => {});

      addLog(`${audioBlobs.length}개 구간으로 분할 완료`);
      await runTranscription(audioBlobs, ext, 0, mime, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
      setState("error");
    } finally {
      setChunkProgress(null);
    }
  };

  /** 실패 지점부터 이어서 재시도 (메모리 기반) */
  const handleResumeRetry = async () => {
    setState("processing");
    setError("");
    addLog("--- 실패 지점부터 이어서 재시도 ---");

    // 복구된 데이터가 있으면 그것 사용, 없으면 현재 세션 데이터 사용
    const mime = recoveredMimeTypeRef.current || actualMimeType;
    const format = recoveredAudioFormatRef.current || audioFormat;

    try {
      if (failedStepRef.current === "summarizing") {
        const fullTranscript = savedFullTranscriptRef.current;
        const totalChunks = savedAudioBlobsRef.current.length;
        addLog(`이전 전사 결과 복원: ${fullTranscript.length}자 (${totalChunks}개 구간 완료)`);
        await runSummarization(fullTranscript, totalChunks);
      } else if (failedStepRef.current === "transcribing") {
        const audioBlobs = savedAudioBlobsRef.current;
        const ext = savedExtRef.current;
        // IndexedDB에서 완료된 청크 목록 로드
        const session = await getSession(projectId).catch(() => null);
        const completed = session?.completedChunks ?? [];
        const remaining = audioBlobs.length - completed.length;
        addLog(`이전 전사 결과 복원: ${completed.length}/${audioBlobs.length}개 구간 완료, ${remaining}개 구간 재시작`);
        await runTranscription(audioBlobs, ext, 0, mime, format, completed);
      } else {
        addLog("보존된 진행 상태 없음, 처음부터 시작합니다.");
        await handleProcessFromStart();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
      setState("error");
    } finally {
      setChunkProgress(null);
    }
  };

  /** 처음부터 재시도 (녹음 데이터 보존, 처리만 재시작) */
  const handleProcessFromStart = async () => {
    // 복구된 데이터가 있으면 그것 사용, 없으면 현재 세션 데이터 사용
    const chunks = recoveredRawChunksRef.current.length > 0
      ? recoveredRawChunksRef.current
      : dataChunks;
    const mime = recoveredMimeTypeRef.current || actualMimeType;
    const format = recoveredAudioFormatRef.current || audioFormat;

    setState("processing");
    setError("");
    setProcessLogs([]);
    clearSavedState();
    addLog("--- 처음부터 다시 처리 ---");

    // IndexedDB 진행 상태 초기화
    await updateSession(projectId, {
      audioBlobs: [],
      ext: "",
      transcripts: [],
      fullTranscript: "",
      failedStep: null,
      failedChunkIndex: 0,
      completedChunks: [],
    }).catch(() => {});

    const totalRawSize = chunks.reduce((sum, c) => sum + c.size, 0);
    addLog(`녹음 데이터: ${chunks.length}개 조각, 총 ${formatBytes(totalRawSize)}`);

    try {
      setChunkProgress({ totalChunks: 0, completedChunks: 0, currentStep: "chunking" });
      setProcessingMessage("오디오를 분할하고 있습니다...");

      const audioBlobs = groupDataChunks(chunks, mime);
      const ext = getExtFromMime(mime);

      savedAudioBlobsRef.current = audioBlobs;
      savedExtRef.current = ext;

      await updateSession(projectId, { audioBlobs, ext }).catch(() => {});

      addLog(`${audioBlobs.length}개 구간으로 분할 완료`);
      await runTranscription(audioBlobs, ext, 0, mime, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
      setState("error");
    } finally {
      setChunkProgress(null);
    }
  };

  /** 전사 실행 (completedSet에 포함되지 않은 청크만 병렬 처리) */
  const runTranscription = async (
    audioBlobs: Blob[],
    ext: string,
    startFrom: number,
    mime: string,
    format: string,
    initialCompleted?: number[],
  ) => {
    const totalChunks = audioBlobs.length;

    if (savedTranscriptsRef.current.length !== totalChunks) {
      savedTranscriptsRef.current = new Array(totalChunks).fill("");
    }
    const transcripts = savedTranscriptsRef.current;

    // 이미 완료된 청크 추적 (복구 시 사용)
    const completedSet = new Set<number>(initialCompleted ?? []);
    let completedCount = completedSet.size;

    setChunkProgress({ totalChunks, completedChunks: completedCount, currentStep: "transcribing" });
    setProcessingMessage(`음성 변환 중... (${completedCount}/${totalChunks} 구간)`);

    // 미완료 청크만 필터링
    const pendingIndices = Array.from({ length: totalChunks }, (_, i) => i)
      .filter((i) => !completedSet.has(i));

    addLog(`병렬 전사 시작: ${pendingIndices.length}개 구간 대기 (동시 ${CONCURRENCY}개)`);

    /** 개별 청크 전사 (재시도 포함) */
    const transcribeChunk = async (i: number) => {
      addLog(`구간 ${i + 1}/${totalChunks} 전사 시작...`);
      const file = new File([audioBlobs[i]], `chunk-${i}.${ext}`, { type: mime });

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const formData = new FormData();
          formData.append("audio", file);
          formData.append("audioFormat", format);
          formData.append("chunkIndex", String(i));
          formData.append("totalChunks", String(totalChunks));

          if (attempt === 1) {
            addLog(`  [${i + 1}] FormData 전송: ${formatBytes(file.size)} (binary)`);
          } else {
            addLog(`  [${i + 1}] 재시도 ${attempt}/${MAX_RETRIES}...`);
          }

          const res = await fetch("/api/transcribe-chunk", {
            method: "POST",
            body: formData,
          });

          const parsed = await safeParseJson<{ chunkIndex: number; transcript: string }>(res);

          if (!parsed.ok) {
            throw new Error(parsed.error);
          }

          transcripts[i] = parsed.data.transcript || "";
          completedSet.add(i);
          completedCount = completedSet.size;

          addLog(`  [${i + 1}] 전사 완료: ${transcripts[i].length}자 (${completedCount}/${totalChunks})`);

          // 진행률 업데이트 + IndexedDB에 저장
          setChunkProgress({ totalChunks, completedChunks: completedCount, currentStep: "transcribing" });
          setProcessingMessage(`음성 변환 중... (${completedCount}/${totalChunks} 구간)`);
          await updateSession(projectId, {
            transcripts: [...transcripts],
            completedChunks: [...completedSet],
          }).catch(() => {});

          return; // 성공
        } catch (chunkErr) {
          const errMsg = chunkErr instanceof Error ? chunkErr.message : "알 수 없는 오류";
          if (attempt < MAX_RETRIES) {
            const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            addLog(`  [${i + 1}] 실패 (${errMsg}), ${(delayMs / 1000).toFixed(0)}초 후 재시도...`);
            await waitMs(delayMs);
          } else {
            addLog(`  [${i + 1}] ${MAX_RETRIES}회 시도 모두 실패: ${errMsg}`);
            failedStepRef.current = "transcribing";
            failedChunkIndexRef.current = i;
            // ★ 실패 상태를 IndexedDB에 저장
            await updateSession(projectId, {
              transcripts: [...transcripts],
              completedChunks: [...completedSet],
              failedStep: "transcribing",
              failedChunkIndex: i,
            }).catch(() => {});
            throw new Error(`${i + 1}번째 구간 처리 실패 (${MAX_RETRIES}회 재시도 후): ${errMsg}`);
          }
        }
      }
    };

    // ★ 병렬 처리 실행
    await pMap(pendingIndices, transcribeChunk, CONCURRENCY);

    const fullTranscript = transcripts
      .filter((t) => t.trim().length > 0 && t.trim() !== "[무음]")
      .join("\n\n");

    addLog(`전체 전사 텍스트: ${fullTranscript.length}자`);

    if (!fullTranscript || fullTranscript.trim().length === 0) {
      setError("음성을 인식할 수 없습니다. 더 선명하게 녹음해 주세요.");
      setState("error");
      return;
    }

    savedFullTranscriptRef.current = fullTranscript;

    // ★ 전사 완료 상태 IndexedDB에 저장
    await updateSession(projectId, { fullTranscript }).catch(() => {});

    await runSummarization(fullTranscript, totalChunks);
  };

  /** 요약 실행 */
  const runSummarization = async (fullTranscript: string, totalChunks: number) => {
    setChunkProgress({ totalChunks, completedChunks: totalChunks, currentStep: "summarizing" });
    setProcessingMessage("회의록을 요약하고 있습니다...");
    addLog("요약 생성 시작...");

    const duration = recoveredDurationRef.current || timer.seconds;

    let summaryParsed: { ok: true; data: TranscribeResponse } | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          addLog(`요약 재시도 ${attempt}/${MAX_RETRIES}...`);
        }

        const summaryRes = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: fullTranscript,
            projectId,
            audioDuration: duration,
          }),
        });

        const parsed = await safeParseJson<TranscribeResponse>(summaryRes);

        if (!parsed.ok) {
          throw new Error(parsed.error);
        }

        summaryParsed = parsed;
        break;
      } catch (sumErr) {
        const errMsg = sumErr instanceof Error ? sumErr.message : "알 수 없는 오류";
        if (attempt < MAX_RETRIES) {
          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          addLog(`요약 실패 (${errMsg}), ${(delayMs / 1000).toFixed(0)}초 후 재시도...`);
          await waitMs(delayMs);
        } else {
          addLog(`요약 ${MAX_RETRIES}회 시도 모두 실패: ${errMsg}`);
          failedStepRef.current = "summarizing";
          // ★ 요약 실패 상태 IndexedDB에 저장
          await updateSession(projectId, {
            failedStep: "summarizing",
            fullTranscript,
          }).catch(() => {});
          throw new Error(`요약 처리 실패 (${MAX_RETRIES}회 재시도 후): ${errMsg}`);
        }
      }
    }

    if (!summaryParsed) {
      failedStepRef.current = "summarizing";
      await updateSession(projectId, {
        failedStep: "summarizing",
        fullTranscript,
      }).catch(() => {});
      throw new Error("요약 처리에 실패했습니다.");
    }

    addLog("회의록 생성 완료!");
    setResult(summaryParsed.data);
    setState("completed");
    clearSavedState();
    recoveredRawChunksRef.current = [];
    recoveredMimeTypeRef.current = "";
    recoveredAudioFormatRef.current = "";
    recoveredDurationRef.current = 0;

    // ★ 완료 시 IndexedDB 정리
    await deleteSession(projectId).catch(() => {});
  };

  /** 새 녹음 (녹음 데이터 포함 전체 초기화) */
  const handleNewRecording = async () => {
    resetRecorder();
    timer.reset();
    setState("idle");
    setError("");
    setResult(null);
    setChunkProgress(null);
    setProcessLogs([]);
    clearSavedState();
    recoveredRawChunksRef.current = [];
    recoveredMimeTypeRef.current = "";
    recoveredAudioFormatRef.current = "";
    recoveredDurationRef.current = 0;
    if (recoveryInfo) {
      URL.revokeObjectURL(recoveryInfo.audioBlobUrl);
      setRecoveryInfo(null);
    }

    // ★ IndexedDB 정리
    await deleteSession(projectId).catch(() => {});
  };

  /** 복구 세션 삭제 */
  const handleDismissRecovery = async () => {
    if (recoveryInfo) {
      URL.revokeObjectURL(recoveryInfo.audioBlobUrl);
      setRecoveryInfo(null);
    }
    await deleteSession(projectId).catch(() => {});
  };

  /** 에러에서 미리보기로 복귀 (녹음 데이터 보존) */
  const handleBackToPreview = () => {
    setState("preview");
    setError("");
    setChunkProgress(null);
  };

  const autoStopTriggered = useRef(false);
  useEffect(() => {
    if (
      state === "recording" &&
      recorderStatus === "recording" &&
      timer.seconds >= MAX_RECORDING_SECONDS &&
      !autoStopTriggered.current
    ) {
      autoStopTriggered.current = true;
      handleStop();
    }
    if (state === "idle") {
      autoStopTriggered.current = false;
    }
  }, [timer.seconds, state, recorderStatus]);

  if (recorderStatus === "stopped" && audioBase64 && state === "recording") {
    setState("preview");
  }

  const remainingSeconds = MAX_RECORDING_SECONDS - timer.seconds;
  const remainingMin = Math.floor(remainingSeconds / 60);
  const remainingSec = remainingSeconds % 60;
  const isNearLimit = remainingSeconds <= 5 * 60;

  const progressPercent = chunkProgress
    ? chunkProgress.currentStep === "summarizing"
      ? 90
      : chunkProgress.totalChunks > 0
        ? Math.round((chunkProgress.completedChunks / chunkProgress.totalChunks) * 80)
        : 0
    : 0;

  const previewTotalSize = dataChunks.reduce((sum, c) => sum + c.size, 0);
  const previewChunkCount =
    dataChunks.length > 0
      ? groupDataChunks(dataChunks, actualMimeType).length
      : 1;

  // 에러 화면에서 보여줄 진행 정보
  const hasResumeData = failedStepRef.current !== null;
  const resumeDescription =
    failedStepRef.current === "summarizing"
      ? "전사 완료 상태에서 요약만 다시 시도합니다."
      : failedStepRef.current === "transcribing"
        ? `미완료 구간을 이어서 처리합니다. (${savedAudioBlobsRef.current.length}개 중 일부 완료)`
        : "";

  // 복구 세션 정보 계산
  const recoveryDescription = recoveryInfo
    ? recoveryInfo.session.failedStep === "summarizing"
      ? "전사 완료 상태에서 요약만 다시 시도합니다."
      : recoveryInfo.session.failedStep === "transcribing"
        ? `미완료 구간을 이어서 처리합니다. (${recoveryInfo.session.completedChunks?.length ?? 0}/${recoveryInfo.session.audioBlobs.length}개 완료)`
        : "처음부터 회의록 생성을 시작합니다."
    : "";

  // 로딩 중
  if (checkingRecovery) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <Spinner size="lg" className="mx-auto" />
        <p className="text-sm text-muted mt-4">이전 녹음 데이터 확인 중...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto text-center">
      {/* ★ 복구 가능한 세션이 있을 때 (idle 상태에서 표시) */}
      {state === "idle" && recoveryInfo && (
        <div className="space-y-6 mb-8">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 mb-1">
                  이전에 완료되지 않은 녹음이 있습니다
                </p>
                <p className="text-xs text-amber-600 mb-2">
                  녹음 시간: {formatDuration(recoveryInfo.session.duration)} /
                  크기: {formatBytes(recoveryInfo.session.rawChunks.reduce((s, c) => s + c.size, 0))}
                </p>
                {recoveryInfo.session.failedStep && (
                  <p className="text-xs text-amber-700 mb-2">
                    {recoveryDescription}
                  </p>
                )}

                {/* 녹음 재생 */}
                <div className="bg-white rounded-lg p-3 mb-3">
                  <p className="text-xs font-medium text-gray-700 mb-1">녹음 재생</p>
                  <audio controls src={recoveryInfo.audioBlobUrl} className="w-full" />
                </div>

                <div className="flex flex-col gap-2">
                  {recoveryInfo.session.failedStep ? (
                    <Button size="sm" onClick={handleRecoveryProcess} className="w-full">
                      이어서 재시도
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleRecoveryProcess} className="w-full">
                      회의록 생성
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={handleRecoveryProcessFromStart} className="w-full">
                    처음부터 재시도
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleDismissRecovery} className="w-full text-danger">
                    이전 녹음 삭제
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-muted">또는 새로 녹음</span>
            </div>
          </div>
        </div>
      )}

      {state === "idle" && (
        <div className="space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-10 h-10 text-recording" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium mb-2">회의 녹음을 시작하세요</p>
            <p className="text-sm text-muted">
              녹음 버튼을 누르면 마이크를 통해 회의 내용이 녹음됩니다.
            </p>
          </div>
          <Button size="lg" onClick={handleStart}>
            녹음 시작
          </Button>
          {recorderError && (
            <p className="text-sm text-danger">{recorderError}</p>
          )}
        </div>
      )}

      {state === "recording" && recorderStatus === "recording" && (
        <div className="space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-50 flex items-center justify-center">
            <div className="w-8 h-8 bg-recording rounded-full animate-pulse-recording" />
          </div>
          <RecordingIndicator duration={timer.formatted} />
          <Button variant="danger" size="lg" onClick={handleStop}>
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            녹음 종료
          </Button>
          <p className={`text-xs ${isNearLimit ? "text-danger font-medium" : "text-muted"}`}>
            {isNearLimit
              ? `남은 시간: ${remainingMin}분 ${String(remainingSec).padStart(2, "0")}초`
              : "최대 80분까지 녹음할 수 있습니다."}
          </p>
        </div>
      )}

      {state === "preview" && (
        <div className="space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium mb-2">녹음 완료</p>
            <p className="text-sm text-muted">
              아래에서 녹음 내용을 확인한 후 회의록을 생성하세요.
            </p>
          </div>
          {audioBlobUrl && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">녹음 재생</p>
              <audio controls src={audioBlobUrl} className="w-full" />
            </div>
          )}
          <div className="bg-gray-50 rounded-lg p-3 text-left text-xs text-muted space-y-1">
            <p><span className="font-medium">녹음 시간:</span> {timer.formatted}</p>
            <p><span className="font-medium">파일 크기:</span> {formatBytes(previewTotalSize)}</p>
            <p><span className="font-medium">녹음 포맷:</span> {actualMimeType}</p>
            <p><span className="font-medium">처리 구간:</span> {previewChunkCount}개 (각 최대 3MB, 동시 {CONCURRENCY}개 병렬 처리)</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-left">
            <p className="text-xs text-green-700">
              녹음 데이터가 브라우저에 안전하게 저장되었습니다. 페이지를 닫아도 복구할 수 있습니다.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button size="lg" onClick={handleProcess}>
              회의록 생성
            </Button>
            <Button variant="secondary" onClick={handleNewRecording}>
              다시 녹음
            </Button>
          </div>
        </div>
      )}

      {state === "processing" && (
        <div className="space-y-6">
          <Spinner size="lg" className="mx-auto" />
          <div>
            <p className="text-lg font-medium mb-2">회의록 생성 중</p>
            <p className="text-sm text-muted">{processingMessage}</p>
          </div>
          {chunkProgress && chunkProgress.totalChunks > 0 && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted">
                {chunkProgress.currentStep === "transcribing" &&
                  `음성 변환: ${chunkProgress.completedChunks}/${chunkProgress.totalChunks} 구간 완료`}
                {chunkProgress.currentStep === "summarizing" &&
                  "요약을 생성하고 있습니다..."}
                {chunkProgress.currentStep === "chunking" &&
                  "오디오를 분할하고 있습니다..."}
              </p>
            </div>
          )}
          {processLogs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 text-left max-h-48 overflow-y-auto">
              {processLogs.map((log, i) => (
                <p key={i} className="text-xs text-green-400 font-mono leading-relaxed">
                  {log}
                </p>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
          <p className="text-xs text-muted">
            녹음 길이에 따라 시간이 소요됩니다. 중단되어도 다시 이어서 처리할 수 있습니다.
          </p>
        </div>
      )}

      {state === "completed" && result && (
        <div className="space-y-6 text-left">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium">회의록이 생성되었습니다!</p>
            <p className="text-sm text-muted mt-1">{result.title}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-sm mb-2">요약</h3>
            <p className="text-sm text-muted">{result.summary.overview}</p>
          </div>
          {processLogs.length > 0 && (
            <details className="text-left">
              <summary className="text-xs text-muted cursor-pointer">
                처리 로그 보기
              </summary>
              <div className="bg-gray-900 rounded-lg p-3 mt-2 max-h-48 overflow-y-auto">
                {processLogs.map((log, i) => (
                  <p key={i} className="text-xs text-green-400 font-mono leading-relaxed">
                    {log}
                  </p>
                ))}
              </div>
            </details>
          )}
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => router.push(`/projects/${projectId}/meetings/${result.meetingId}`)}
            >
              회의록 보기
            </Button>
            <Button variant="secondary" onClick={handleNewRecording}>
              새 녹음
            </Button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium mb-2">오류가 발생했습니다</p>
            <p className="text-sm text-danger">{error}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-left">
            <p className="text-sm text-blue-800 font-medium mb-1">
              녹음 데이터가 안전하게 보존되어 있습니다
            </p>
            <p className="text-xs text-blue-600">
              페이지를 닫아도 다시 돌아오면 녹음 데이터를 복구할 수 있습니다.
            </p>
          </div>

          {processLogs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 text-left max-h-48 overflow-y-auto">
              {processLogs.map((log, i) => (
                <p key={i} className="text-xs text-green-400 font-mono leading-relaxed">
                  {log}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {hasResumeData && (
              <div>
                <Button className="w-full" onClick={handleResumeRetry}>
                  이어서 재시도
                </Button>
                <p className="text-xs text-muted mt-1">{resumeDescription}</p>
              </div>
            )}

            <Button variant="secondary" className="w-full" onClick={handleProcessFromStart}>
              처음부터 재시도
            </Button>

            <Button variant="ghost" className="w-full" onClick={handleBackToPreview}>
              녹음 미리보기로 돌아가기
            </Button>

            <Button variant="ghost" className="w-full text-danger" onClick={handleNewRecording}>
              새로 녹음하기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
