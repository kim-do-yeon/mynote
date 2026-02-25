"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

interface ProjectDeleteButtonProps {
  projectId: string;
  projectName: string;
}

export default function ProjectDeleteButton({
  projectId,
  projectName,
}: ProjectDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      router.push("/projects");
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
        title="프로젝트 삭제"
        description={`"${projectName}" 프로젝트와 모든 회의록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        confirmVariant="danger"
        loading={loading}
      />
    </>
  );
}
