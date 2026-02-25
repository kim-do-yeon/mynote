"use client";

import { useState, useRef, useCallback } from "react";

export type RecorderStatus = "idle" | "recording" | "stopped" | "error";

interface UseAudioRecorderReturn {
  status: RecorderStatus;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  audioBase64: string | null;
  audioBlobUrl: string | null;
  audioFormat: string;
  actualMimeType: string;
  audioSizeKB: number;
  /** MediaRecorder의 1초 단위 raw data chunks (분할 처리용) */
  dataChunks: Blob[];
  error: string | null;
  reset: () => void;
}

function getSupportedMimeType(): string {
  if (typeof window === "undefined") return "audio/ogg";
  const types = [
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}

function getFormatFromMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("webm")) return "wav";
  return "ogg";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // "data:audio/ogg;base64,XXXX" 에서 base64 부분만 추출
      const base64 = dataUrl.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioFormat, setAudioFormat] = useState("ogg");
  const [actualMimeType, setActualMimeType] = useState("");
  const [audioSizeKB, setAudioSizeKB] = useState(0);
  const [dataChunks, setDataChunks] = useState<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setAudioBase64(null);
      setDataChunks([]);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      setAudioFormat(getFormatFromMime(mimeType));

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const allChunks = [...chunksRef.current];
        setDataChunks(allChunks);

        const blob = new Blob(allChunks, { type: mimeType });
        setAudioSizeKB(Math.round(blob.size / 1024));
        setActualMimeType(mimeType);

        // 재생용 URL 생성
        const blobUrl = URL.createObjectURL(blob);
        setAudioBlobUrl(blobUrl);

        // 브라우저 네이티브 base64 변환 (대용량 파일 안전)
        try {
          const base64 = await blobToBase64(blob);
          setAudioBase64(base64);
          setStatus("stopped");
        } catch {
          setError("녹음 데이터 변환에 실패했습니다. 다시 시도해주세요.");
          setStatus("error");
        }

        // 마이크 해제
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(1000);
      setStatus("recording");
    } catch {
      setError(
        "마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요."
      );
      setStatus("error");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setStatus("idle");
    setAudioBase64(null);
    setAudioBlobUrl(null);
    setAudioSizeKB(0);
    setActualMimeType("");
    setDataChunks([]);
    setError(null);
  }, [audioBlobUrl]);

  return {
    status,
    startRecording,
    stopRecording,
    audioBase64,
    audioBlobUrl,
    audioFormat,
    actualMimeType,
    audioSizeKB,
    dataChunks,
    error,
    reset,
  };
}
