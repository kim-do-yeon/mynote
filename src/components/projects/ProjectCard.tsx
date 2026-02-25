import Link from "next/link";
import Card from "@/components/ui/Card";
import { formatRelativeDate } from "@/lib/date-utils";

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  meetingCount?: number;
  updatedAt: Date;
}

export default function ProjectCard({
  id,
  name,
  description,
  meetingCount = 0,
  updatedAt,
}: ProjectCardProps) {
  return (
    <Link href={`/projects/${id}`}>
      <Card hover>
        <h3 className="font-bold text-base mb-1 truncate">{name}</h3>
        {description && (
          <p className="text-sm text-muted mb-3 line-clamp-2">{description}</p>
        )}
        <div className="flex items-center justify-between text-xs text-muted">
          <span>회의록 {meetingCount}개</span>
          <span>{formatRelativeDate(new Date(updatedAt))}</span>
        </div>
      </Card>
    </Link>
  );
}
