"use client";

import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

interface BackButtonProps {
  href?: string;
  label?: string;
}

export default function BackButton({
  href,
  label = "뒤로",
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleClick}>
      <svg
        className="w-4 h-4 mr-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 19l-7-7 7-7"
        />
      </svg>
      {label}
    </Button>
  );
}
