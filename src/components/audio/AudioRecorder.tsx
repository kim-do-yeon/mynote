"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useTimer } from "@/hooks/useTimer";
import RecordingIndicator from "./RecordingIndicator";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
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
    error: recorderError,
    reset: resetRecorder,
  } = useAudioRecorder();
  const timer = useTimer();

  const [state, setState] = useState<ProcessingState>("idle");
  const [processingMessage, setProcessingMessage] = useState("");
  const [result, setResult] = useState<TranscribeResponse | null>(null);
  const [error, setError] = useState("");

  const handleStart = async () => {
    setState("recording");
    setError("");
    timer.start();
    await startRecording();
  };

  const handleStop = () => {
    stopRecording();
    timer.stop();
  };

  const handleProcess = async () => {
    if (!audioBase64) {
      setError("녹음 데이터가 없습니다. 다시 녹음해주세요.");
      setState("error");
      return;
    }

    setState("processing");
    setProcessingMessage("음성을 텍스트로 변환하고 있습니다...");
    setError("");

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          audioFormat,
          projectId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "처리 중 오류가 발생했습니다.");
      }

      const data: TranscribeResponse = await res.json();
      setResult(data);
      setState("completed");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "처리 중 오류가 발생했습니다."
      );
      setState("error");
    }
  };

  const handleRetry = () => {
    resetRecorder();
    timer.reset();
    setState("idle");
    setError("");
    setResult(null);
  };

  // 80분 도달 시 자동 녹음 중지
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

  // 녹음이 멈추면 미리보기 단계로
  if (recorderStatus === "stopped" && audioBase64 && state === "recording") {
    setState("preview");
  }

  // 남은 시간 계산
  const remainingSeconds = MAX_RECORDING_SECONDS - timer.seconds;
  const remainingMin = Math.floor(remainingSeconds / 60);
  const remainingSec = remainingSeconds % 60;
  const isNearLimit = remainingSeconds <= 5 * 60; // 5분 이하일 때 경고

  return (
    <div className="max-w-lg mx-auto text-center">
      {/* Idle 상태 */}
      {state === "idle" && (
        <div className="space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-50 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-recording"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
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

      {/* 녹음 중 */}
      {state === "recording" && recorderStatus === "recording" && (
        <div className="space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full bg-red-50 flex items-center justify-center">
            <div className="w-8 h-8 bg-recording rounded-full animate-pulse-recording" />
          </div>
          <RecordingIndicator duration={timer.formatted} />
          <Button variant="danger" size="lg" onClick={handleStop}>
            <svg
              className="w-5 h-5 mr-2"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
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

      {/* 녹음 확인 (미리보기) */}
      {state === "preview" && (
        <div className="space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <div>
            <p className="text-lg font-medium mb-2">녹음 완료</p>
            <p className="text-sm text-muted">
              아래에서 녹음 내용을 확인한 후 회의록을 생성하세요.
            </p>
          </div>

          {/* 녹음 재생 */}
          {audioBlobUrl && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">녹음 재생</p>
              <audio controls src={audioBlobUrl} className="w-full" />
            </div>
          )}

          {/* 디버그 정보 */}
          <div className="bg-gray-50 rounded-lg p-3 text-left text-xs text-muted space-y-1">
            <p>
              <span className="font-medium">녹음 시간:</span> {timer.formatted}
            </p>
            <p>
              <span className="font-medium">파일 크기:</span> {audioSizeKB} KB
            </p>
            <p>
              <span className="font-medium">녹음 포맷:</span> {actualMimeType}
            </p>
            <p>
              <span className="font-medium">전송 포맷:</span> {audioFormat}
            </p>
            <p>
              <span className="font-medium">Base64 길이:</span>{" "}
              {audioBase64 ? audioBase64.length.toLocaleString() : "없음"}
            </p>
            <p>
              <span className="font-medium">Base64 시작:</span>{" "}
              {audioBase64 ? audioBase64.substring(0, 30) + "..." : "없음"}
            </p>
          </div>

          <div className="flex gap-3 justify-center">
            <Button size="lg" onClick={handleProcess}>
              회의록 생성
            </Button>
            <Button variant="secondary" onClick={handleRetry}>
              다시 녹음
            </Button>
          </div>
        </div>
      )}

      {/* 처리 중 */}
      {state === "processing" && (
        <div className="space-y-6">
          <Spinner size="lg" className="mx-auto" />
          <div>
            <p className="text-lg font-medium mb-2">회의록 생성 중</p>
            <p className="text-sm text-muted">{processingMessage}</p>
          </div>
          <p className="text-xs text-muted">
            녹음 시간에 따라 1~5분 정도 소요될 수 있습니다.
          </p>
        </div>
      )}

      {/* 완료 */}
      {state === "completed" && result && (
        <div className="space-y-6 text-left">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-lg font-medium">회의록이 생성되었습니다!</p>
            <p className="text-sm text-muted mt-1">{result.title}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-bold text-sm mb-2">요약</h3>
            <p className="text-sm text-muted">{result.summary.overview}</p>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              onClick={() =>
                router.push(
                  `/projects/${projectId}/meetings/${result.meetingId}`
                )
              }
            >
              회의록 보기
            </Button>
            <Button variant="secondary" onClick={handleRetry}>
              새 녹음
            </Button>
          </div>
        </div>
      )}

      {/* 에러 */}
      {state === "error" && (
        <div className="space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-danger"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-lg font-medium mb-2">오류가 발생했습니다</p>
            <p className="text-sm text-danger">{error}</p>
          </div>
          <Button onClick={handleRetry}>다시 시도</Button>
        </div>
      )}
    </div>
  );
}
