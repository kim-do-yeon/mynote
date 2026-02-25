"use client";

import { useState, useEffect, useRef } from "react";
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
import { TranscribeResponse } from "@/types";

const MAX_RECORDING_SECONDS = 80 * 60; // 80분

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

function getExtFromMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("webm")) return "webm";
  return "webm";
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

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString("ko-KR");
    setProcessLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [processLogs]);

  const handleStart = async () => {
    setState("recording");
    setError("");
    setProcessLogs([]);
    timer.start();
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
    timer.stop();
  };

  const handleProcess = async () => {
    if (dataChunks.length === 0) {
      setError("녹음 데이터가 없습니다. 다시 녹음해주세요.");
      setState("error");
      return;
    }

    setState("processing");
    setError("");
    setProcessLogs([]);

    const totalRawSize = dataChunks.reduce((sum, c) => sum + c.size, 0);
    addLog(
      `녹음 데이터: ${dataChunks.length}개 조각, 총 ${formatBytes(totalRawSize)}`
    );

    try {
      // Step 1: 크기 기반으로 오디오 chunk 분할
      setChunkProgress({
        totalChunks: 0,
        completedChunks: 0,
        currentStep: "chunking",
      });
      setProcessingMessage("오디오를 분할하고 있습니다...");

      const audioBlobs = groupDataChunks(dataChunks, actualMimeType);
      const totalChunks = audioBlobs.length;
      const ext = getExtFromMime(actualMimeType);

      addLog(`${totalChunks}개 구간으로 분할 완료`);
      for (let i = 0; i < totalChunks; i++) {
        addLog(`  구간 ${i + 1}: ${formatBytes(audioBlobs[i].size)}`);
      }

      setChunkProgress({
        totalChunks,
        completedChunks: 0,
        currentStep: "transcribing",
      });

      // Step 2: 각 chunk를 FormData로 순차 전송
      const transcripts: string[] = new Array(totalChunks).fill("");

      for (let i = 0; i < totalChunks; i++) {
        setProcessingMessage(
          `음성 변환 중... (${i + 1}/${totalChunks} 구간)`
        );
        addLog(`구간 ${i + 1}/${totalChunks} 전사 시작...`);

        const file = new File(
          [audioBlobs[i]],
          `chunk-${i}.${ext}`,
          { type: actualMimeType }
        );

        const formData = new FormData();
        formData.append("audio", file);
        formData.append("audioFormat", audioFormat);
        formData.append("chunkIndex", String(i));
        formData.append("totalChunks", String(totalChunks));

        addLog(`  FormData 전송: ${formatBytes(file.size)} (binary)`);

        const res = await fetch("/api/transcribe-chunk", {
          method: "POST",
          body: formData,
        });

        // ★ 안전 파싱: .json() 직접 호출 안 함
        const parsed = await safeParseJson<{ chunkIndex: number; transcript: string }>(res);

        if (!parsed.ok) {
          addLog(`  ❌ 실패: ${parsed.error}`);
          throw new Error(`${i + 1}번째 구간 처리 실패: ${parsed.error}`);
        }

        transcripts[i] = parsed.data.transcript || "";
        addLog(`  ✅ 전사 완료: ${transcripts[i].length}자`);

        setChunkProgress({
          totalChunks,
          completedChunks: i + 1,
          currentStep: "transcribing",
        });
      }

      // Step 3: 전사 결과 통합
      const fullTranscript = transcripts
        .filter((t) => t.trim().length > 0 && t.trim() !== "[무음]")
        .join("\n\n");

      addLog(`전체 전사 텍스트: ${fullTranscript.length}자`);

      if (!fullTranscript || fullTranscript.trim().length === 0) {
        setError("음성을 인식할 수 없습니다. 더 선명하게 녹음해 주세요.");
        setState("error");
        return;
      }

      // Step 4: 통합 요약
      setChunkProgress({
        totalChunks,
        completedChunks: totalChunks,
        currentStep: "summarizing",
      });
      setProcessingMessage("회의록을 요약하고 있습니다...");
      addLog("요약 생성 시작...");

      const summaryRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: fullTranscript,
          projectId,
          audioDuration: timer.seconds,
        }),
      });

      // ★ 안전 파싱
      const summaryParsed = await safeParseJson<TranscribeResponse>(summaryRes);

      if (!summaryParsed.ok) {
        addLog(`❌ 요약 실패: ${summaryParsed.error}`);
        throw new Error(summaryParsed.error);
      }

      addLog("✅ 회의록 생성 완료!");
      setResult(summaryParsed.data);
      setState("completed");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "처리 중 오류가 발생했습니다."
      );
      setState("error");
    } finally {
      setChunkProgress(null);
    }
  };

  const handleRetry = () => {
    resetRecorder();
    timer.reset();
    setState("idle");
    setError("");
    setResult(null);
    setChunkProgress(null);
    setProcessLogs([]);
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
        ? Math.round(
            (chunkProgress.completedChunks / chunkProgress.totalChunks) * 80
          )
        : 0
    : 0;

  const previewTotalSize = dataChunks.reduce((sum, c) => sum + c.size, 0);
  const previewChunkCount =
    dataChunks.length > 0
      ? groupDataChunks(dataChunks, actualMimeType).length
      : 1;

  return (
    <div className="max-w-lg mx-auto text-center">
      {state === "idle" && (
        <div className="space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-10 h-10 text-recording" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium mb-2">회의 녹음을 시작하세요</p>
            <p className="text-sm text-muted">녹음 버튼을 누르면 마이크를 통해 회의 내용이 녹음됩니다.</p>
          </div>
          <Button size="lg" onClick={handleStart}>녹음 시작</Button>
          {recorderError && <p className="text-sm text-danger">{recorderError}</p>}
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
            <p className="text-sm text-muted">아래에서 녹음 내용을 확인한 후 회의록을 생성하세요.</p>
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
            <p><span className="font-medium">처리 구간:</span> {previewChunkCount}개 (각 최대 1MB, binary 전송)</p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button size="lg" onClick={handleProcess}>회의록 생성</Button>
            <Button variant="secondary" onClick={handleRetry}>다시 녹음</Button>
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
                {chunkProgress.currentStep === "summarizing" && "요약을 생성하고 있습니다..."}
                {chunkProgress.currentStep === "chunking" && "오디오를 분할하고 있습니다..."}
              </p>
            </div>
          )}
          {processLogs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 text-left max-h-48 overflow-y-auto">
              {processLogs.map((log, i) => (
                <p key={i} className="text-xs text-green-400 font-mono leading-relaxed">{log}</p>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
          <p className="text-xs text-muted">녹음 길이에 따라 시간이 소요됩니다.</p>
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
              <summary className="text-xs text-muted cursor-pointer">처리 로그 보기</summary>
              <div className="bg-gray-900 rounded-lg p-3 mt-2 max-h-48 overflow-y-auto">
                {processLogs.map((log, i) => (
                  <p key={i} className="text-xs text-green-400 font-mono leading-relaxed">{log}</p>
                ))}
              </div>
            </details>
          )}
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push(`/projects/${projectId}/meetings/${result.meetingId}`)}>
              회의록 보기
            </Button>
            <Button variant="secondary" onClick={handleRetry}>새 녹음</Button>
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
          {processLogs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 text-left max-h-48 overflow-y-auto">
              {processLogs.map((log, i) => (
                <p key={i} className="text-xs text-green-400 font-mono leading-relaxed">{log}</p>
              ))}
            </div>
          )}
          <Button onClick={handleRetry}>다시 시도</Button>
        </div>
      )}
    </div>
  );
}
