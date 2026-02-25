"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import { SearchResponse } from "@/types";

interface SearchPanelProps {
  projectId: string;
  completedMeetingCount: number;
}

type SearchState = "idle" | "searching" | "results" | "error";

export default function SearchPanel({
  projectId,
  completedMeetingCount,
}: SearchPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<SearchState>("idle");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim() || state === "searching") return;

    setState("searching");
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, query: query.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "검색에 실패했습니다.");
      }

      setResult(data as SearchResponse);
      setState("results");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "검색 중 오류가 발생했습니다."
      );
      setState("error");
    }
  };

  const handleReset = () => {
    setQuery("");
    setResult(null);
    setState("idle");
    setError("");
  };

  // 닫힌 상태: "검색 활성화" 버튼
  if (!isOpen) {
    return (
      <div className="mt-8 text-center">
        <Button
          variant="secondary"
          onClick={() => setIsOpen(true)}
          disabled={completedMeetingCount === 0}
        >
          <svg
            className="w-4 h-4 mr-1.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          검색 활성화
        </Button>
        {completedMeetingCount === 0 && (
          <p className="text-xs text-muted mt-2">
            완료된 회의록이 있어야 검색할 수 있습니다.
          </p>
        )}
      </div>
    );
  }

  // 열린 상태: 검색 패널
  return (
    <div className="mt-8">
      <Card>
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <svg
              className="w-5 h-5 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            AI 회의록 검색
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsOpen(false);
              handleReset();
            }}
          >
            닫기
          </Button>
        </div>

        {/* 검색 입력 */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="질문을 입력하세요..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={state === "searching"}
            maxLength={500}
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={state === "searching" || !query.trim()}
          >
            검색
          </Button>
        </form>

        {/* 안내 텍스트 (idle) */}
        {state === "idle" && (
          <div className="text-sm text-muted space-y-1">
            <p>이 프로젝트의 회의록에서 원하는 정보를 자연어로 검색하세요.</p>
            <p className="text-xs">
              예: &quot;지난 회의에서 결정된 마감일은?&quot;,
              &quot;김철수가 맡은 업무는 무엇인가요?&quot;
            </p>
          </div>
        )}

        {/* 검색 중 */}
        {state === "searching" && (
          <div className="flex items-center gap-3 py-6 justify-center">
            <Spinner size="sm" />
            <span className="text-sm text-muted">
              {completedMeetingCount}개 회의록을 분석하고 있습니다...
            </span>
          </div>
        )}

        {/* 검색 결과 */}
        {state === "results" && result && (
          <div className="space-y-4">
            {/* 답변 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {result.answer}
              </p>
            </div>

            {/* 출처 회의록 */}
            {result.sources.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted mb-2">
                  출처 회의록 ({result.sources.length}건)
                </h4>
                <div className="space-y-2">
                  {result.sources.map((source) => (
                    <Link
                      key={source.meetingId}
                      href={`/projects/${projectId}/meetings/${source.meetingId}`}
                    >
                      <Card hover className="py-3">
                        <p className="text-sm font-medium">
                          {source.meetingTitle}
                        </p>
                        <p className="text-xs text-muted mt-1">
                          {source.createdAt} — {source.relevance}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 분석 정보 */}
            <p className="text-xs text-muted">
              {result.meetingsAnalyzed}개 회의록을 분석했습니다.
            </p>

            {/* 새 질문 버튼 */}
            <Button variant="secondary" size="sm" onClick={handleReset}>
              새 질문
            </Button>
          </div>
        )}

        {/* 에러 */}
        {state === "error" && (
          <div className="py-4">
            <p className="text-sm text-danger">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              className="mt-3"
            >
              다시 시도
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
