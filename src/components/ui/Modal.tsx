"use client";

import { useEffect, useRef } from "react";
import Button from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  loading?: boolean;
}

export default function Modal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "확인",
  confirmVariant = "danger",
  loading = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="rounded-xl border border-border p-0 backdrop:bg-black/40 max-w-sm w-full"
      onClose={onClose}
    >
      <div className="p-6">
        <h3 className="text-lg font-bold mb-2">{title}</h3>
        <p className="text-sm text-muted mb-6">{description}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "처리 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
