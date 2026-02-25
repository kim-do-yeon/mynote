import { format } from "date-fns";
import { ko } from "date-fns/locale";

export function formatDateForTitle(date: Date): string {
  return format(date, "yyyy-MM-dd", { locale: ko });
}

export function formatDateTimeFull(date: Date): string {
  return format(date, "yyyy년 M월 d일 (EEEE) HH:mm", { locale: ko });
}

export function formatDateShort(date: Date): string {
  return format(date, "M월 d일", { locale: ko });
}

export function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatDateShort(date);
}
