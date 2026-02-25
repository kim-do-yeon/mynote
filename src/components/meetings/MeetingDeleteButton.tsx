"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

interface MeetingDeleteButtonProps {
  meetingId: string;
  projectId: string;
}

export default function MeetingDeleteButton({
  meetingId,
  projectId,
}: MeetingDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch {
      alert("삭제에 실패했습니다.");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        삭제
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleDelete}
        title="회의록 삭제"
        description="이 회의록을 삭제합니다. 이 작업은 되돌릴 수 없습니다."
        confirmLabel="삭제"
        confirmVariant="danger"
        loading={loading}
      />
    </>
  );
}
