import Link from "next/link";
import Card from "@/components/ui/Card";
import { formatDateTimeFull } from "@/lib/date-utils";
import { MeetingStatus } from "@/types";

interface MeetingCardProps {
  id: string;
  projectId: string;
  title: string;
  overview?: string;
  status: MeetingStatus;
  createdAt: Date;
}

const statusLabels: Record<MeetingStatus, { label: string; color: string }> = {
  recording: { label: "녹음 중", color: "text-red-500" },
  transcribing: { label: "전사 중", color: "text-yellow-600" },
  summarizing: { label: "요약 중", color: "text-blue-500" },
  completed: { label: "완료", color: "text-green-600" },
  error: { label: "오류", color: "text-red-500" },
};

export default function MeetingCard({
  id,
  projectId,
  title,
  overview,
  status,
  createdAt,
}: MeetingCardProps) {
  const statusInfo = statusLabels[status] || statusLabels.completed;

  return (
    <Link href={`/projects/${projectId}/meetings/${id}`}>
      <Card hover>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-base truncate">{title}</h3>
            {overview && (
              <p className="text-sm text-muted mt-1 line-clamp-2">{overview}</p>
            )}
            <p className="text-xs text-muted mt-2">
              {formatDateTimeFull(new Date(createdAt))}
            </p>
          </div>
          <span className={`text-xs font-medium shrink-0 ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
      </Card>
    </Link>
  );
}
