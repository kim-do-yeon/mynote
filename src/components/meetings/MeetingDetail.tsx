"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { MeetingSummary, ActionItem } from "@/types";

interface MeetingDetailProps {
  meetingId: string;
  summary: MeetingSummary;
  transcript: string;
}

export default function MeetingDetail({
  meetingId,
  summary,
  transcript,
}: MeetingDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // 편집용 상태
  const [editOverview, setEditOverview] = useState(summary.overview || "");
  const [editKeyPoints, setEditKeyPoints] = useState<string[]>(
    summary.keyPoints?.length ? [...summary.keyPoints] : [""]
  );
  const [editDecisions, setEditDecisions] = useState<string[]>(
    summary.decisions?.length ? [...summary.decisions] : [""]
  );
  const [editActionItems, setEditActionItems] = useState<ActionItem[]>(
    summary.actionItems?.length
      ? summary.actionItems.map((a) => ({ ...a }))
      : [{ task: "", assignee: "", deadline: "" }]
  );

  // 현재 표시 데이터 (저장 성공 시 반영)
  const [currentSummary, setCurrentSummary] = useState<MeetingSummary>(summary);

  const handleEdit = () => {
    setIsEditing(true);
    setError("");
    setSuccessMsg("");
    setEditOverview(currentSummary.overview || "");
    setEditKeyPoints(
      currentSummary.keyPoints?.length ? [...currentSummary.keyPoints] : [""]
    );
    setEditDecisions(
      currentSummary.decisions?.length ? [...currentSummary.decisions] : [""]
    );
    setEditActionItems(
      currentSummary.actionItems?.length
        ? currentSummary.actionItems.map((a) => ({ ...a }))
        : [{ task: "", assignee: "", deadline: "" }]
    );
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccessMsg("");

    const filteredKeyPoints = editKeyPoints.filter((p) => p.trim());
    const filteredDecisions = editDecisions.filter((d) => d.trim());
    const filteredActionItems = editActionItems.filter((a) => a.task.trim());

    const updatedSummary: MeetingSummary = {
      overview: editOverview.trim(),
      keyPoints: filteredKeyPoints,
      decisions: filteredDecisions,
      actionItems: filteredActionItems,
    };

    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: updatedSummary }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "저장에 실패했습니다.");
      }

      setCurrentSummary(updatedSummary);
      setIsEditing(false);
      setSuccessMsg("저장되었습니다.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "저장 중 오류가 발생했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  // --- 리스트 항목 헬퍼 ---
  const addKeyPoint = () => setEditKeyPoints([...editKeyPoints, ""]);
  const removeKeyPoint = (idx: number) =>
    setEditKeyPoints(editKeyPoints.filter((_, i) => i !== idx));
  const updateKeyPoint = (idx: number, val: string) =>
    setEditKeyPoints(editKeyPoints.map((p, i) => (i === idx ? val : p)));

  const addDecision = () => setEditDecisions([...editDecisions, ""]);
  const removeDecision = (idx: number) =>
    setEditDecisions(editDecisions.filter((_, i) => i !== idx));
  const updateDecision = (idx: number, val: string) =>
    setEditDecisions(editDecisions.map((d, i) => (i === idx ? val : d)));

  const addActionItem = () =>
    setEditActionItems([
      ...editActionItems,
      { task: "", assignee: "", deadline: "" },
    ]);
  const removeActionItem = (idx: number) =>
    setEditActionItems(editActionItems.filter((_, i) => i !== idx));
  const updateActionItem = (
    idx: number,
    field: keyof ActionItem,
    val: string
  ) =>
    setEditActionItems(
      editActionItems.map((a, i) => (i === idx ? { ...a, [field]: val } : a))
    );

  // ===== 수정 모드 =====
  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">회의록 수정</h2>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <span className="flex items-center gap-1.5">
                  <Spinner size="sm" className="text-white" />
                  저장 중...
                </span>
              ) : (
                "저장"
              )}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {/* 개요 */}
        <Card>
          <h3 className="font-bold text-sm text-muted mb-2">회의 개요</h3>
          <textarea
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-vertical min-h-[80px]"
            value={editOverview}
            onChange={(e) => setEditOverview(e.target.value)}
            placeholder="회의 개요를 입력하세요..."
          />
        </Card>

        {/* 주요 논의 사항 */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-muted">주요 논의 사항</h3>
            <button
              type="button"
              onClick={addKeyPoint}
              className="text-xs text-primary hover:underline"
            >
              + 항목 추가
            </button>
          </div>
          <div className="space-y-2">
            {editKeyPoints.map((point, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-primary shrink-0 mt-2">&#8226;</span>
                <input
                  type="text"
                  className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={point}
                  onChange={(e) => updateKeyPoint(i, e.target.value)}
                  placeholder="논의 사항 입력..."
                />
                {editKeyPoints.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeKeyPoint(i)}
                    className="text-muted hover:text-danger text-sm px-1"
                  >
                    &#10005;
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* 결정 사항 */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-muted">결정 사항</h3>
            <button
              type="button"
              onClick={addDecision}
              className="text-xs text-primary hover:underline"
            >
              + 항목 추가
            </button>
          </div>
          <div className="space-y-2">
            {editDecisions.map((decision, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-green-600 shrink-0 mt-2">&#10003;</span>
                <input
                  type="text"
                  className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={decision}
                  onChange={(e) => updateDecision(i, e.target.value)}
                  placeholder="결정 사항 입력..."
                />
                {editDecisions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDecision(i)}
                    className="text-muted hover:text-danger text-sm px-1"
                  >
                    &#10005;
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* 실행 항목 */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-muted">실행 항목</h3>
            <button
              type="button"
              onClick={addActionItem}
              className="text-xs text-primary hover:underline"
            >
              + 항목 추가
            </button>
          </div>
          <div className="space-y-3">
            {editActionItems.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    value={item.task}
                    onChange={(e) =>
                      updateActionItem(i, "task", e.target.value)
                    }
                    placeholder="할 일"
                  />
                  <input
                    type="text"
                    className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    value={item.assignee}
                    onChange={(e) =>
                      updateActionItem(i, "assignee", e.target.value)
                    }
                    placeholder="담당자"
                  />
                  <input
                    type="text"
                    className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    value={item.deadline}
                    onChange={(e) =>
                      updateActionItem(i, "deadline", e.target.value)
                    }
                    placeholder="기한"
                  />
                </div>
                {editActionItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeActionItem(i)}
                    className="text-muted hover:text-danger text-sm px-1 mt-1.5"
                  >
                    &#10005;
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* 원본 전사 내용 */}
        {transcript && (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-muted hover:text-foreground transition-colors">
              원본 녹취록 보기
            </summary>
            <Card className="mt-2">
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted">
                {transcript}
              </p>
            </Card>
          </details>
        )}
      </div>
    );
  }

  // ===== 읽기 모드 =====
  return (
    <div className="space-y-6">
      {/* 수정 버튼 + 성공 메시지 */}
      <div className="flex items-center justify-between">
        <div>
          {successMsg && (
            <span className="text-sm text-green-600">{successMsg}</span>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={handleEdit}>
          <svg
            className="w-3.5 h-3.5 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          내용 수정
        </Button>
      </div>

      {/* 개요 */}
      <Card>
        <h3 className="font-bold text-sm text-muted mb-2">회의 개요</h3>
        <p className="text-sm leading-relaxed">
          {currentSummary.overview || "요약 정보가 없습니다."}
        </p>
      </Card>

      {/* 주요 논의 사항 */}
      {currentSummary.keyPoints && currentSummary.keyPoints.length > 0 && (
        <Card>
          <h3 className="font-bold text-sm text-muted mb-3">주요 논의 사항</h3>
          <ul className="space-y-2">
            {currentSummary.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-primary shrink-0">&#8226;</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 결정 사항 */}
      {currentSummary.decisions && currentSummary.decisions.length > 0 && (
        <Card>
          <h3 className="font-bold text-sm text-muted mb-3">결정 사항</h3>
          <ul className="space-y-2">
            {currentSummary.decisions.map((decision, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-green-600 shrink-0">&#10003;</span>
                <span>{decision}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 실행 항목 */}
      {currentSummary.actionItems &&
        currentSummary.actionItems.length > 0 && (
          <Card>
            <h3 className="font-bold text-sm text-muted mb-3">실행 항목</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted">
                      할 일
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-muted">
                      담당자
                    </th>
                    <th className="text-left py-2 font-medium text-muted">
                      기한
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentSummary.actionItems.map((item, i) => (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-2 pr-4">{item.task}</td>
                      <td className="py-2 pr-4 text-muted">{item.assignee}</td>
                      <td className="py-2 text-muted">{item.deadline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

      {/* 원본 전사 내용 */}
      {transcript && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted hover:text-foreground transition-colors">
            원본 녹취록 보기
          </summary>
          <Card className="mt-2">
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted">
              {transcript}
            </p>
          </Card>
        </details>
      )}
    </div>
  );
}
