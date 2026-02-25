"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

interface MeetingFormProps {
  meetingId: string;
  projectId: string;
  initialTitle: string;
}

export default function MeetingForm({
  meetingId,
  projectId,
  initialTitle,
}: MeetingFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "수정에 실패했습니다.");
      }

      router.push(`/projects/${projectId}/meetings/${meetingId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <Input
        id="title"
        label="회의록 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "저장 중..." : "저장"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          취소
        </Button>
      </div>
    </form>
  );
}
