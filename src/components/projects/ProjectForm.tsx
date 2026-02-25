"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

interface ProjectFormProps {
  initialData?: {
    name: string;
    description?: string;
  };
  projectId?: string;
}

export default function ProjectForm({
  initialData,
  projectId,
}: ProjectFormProps) {
  const router = useRouter();
  const isEdit = !!projectId;

  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("프로젝트 이름을 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = isEdit ? `/api/projects/${projectId}` : "/api/projects";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "오류가 발생했습니다.");
      }

      const project = await res.json();
      router.push(`/projects/${project._id}`);
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
        id="name"
        label="프로젝트 이름"
        placeholder="예: 마케팅 팀, 개발 스프린트"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Textarea
        id="description"
        label="설명 (선택)"
        placeholder="프로젝트에 대한 간단한 설명"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "저장 중..." : isEdit ? "수정" : "생성"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          취소
        </Button>
      </div>
    </form>
  );
}
