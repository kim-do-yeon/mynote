"use client";

interface RecordingIndicatorProps {
  duration: string;
}

export default function RecordingIndicator({
  duration,
}: RecordingIndicatorProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="w-4 h-4 bg-recording rounded-full animate-pulse-recording" />
      </div>
      <span className="text-lg font-mono font-bold tabular-nums">
        {duration}
      </span>
      <span className="text-sm text-muted">녹음 중...</span>
    </div>
  );
}
