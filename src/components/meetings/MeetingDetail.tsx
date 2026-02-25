import Card from "@/components/ui/Card";
import { MeetingSummary } from "@/types";

interface MeetingDetailProps {
  summary: MeetingSummary;
  transcript: string;
}

export default function MeetingDetail({
  summary,
  transcript,
}: MeetingDetailProps) {
  return (
    <div className="space-y-6">
      {/* 개요 */}
      <Card>
        <h3 className="font-bold text-sm text-muted mb-2">회의 개요</h3>
        <p className="text-sm leading-relaxed">{summary.overview || "요약 정보가 없습니다."}</p>
      </Card>

      {/* 주요 논의 사항 */}
      {summary.keyPoints && summary.keyPoints.length > 0 && (
        <Card>
          <h3 className="font-bold text-sm text-muted mb-3">주요 논의 사항</h3>
          <ul className="space-y-2">
            {summary.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-primary shrink-0">&#8226;</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 결정 사항 */}
      {summary.decisions && summary.decisions.length > 0 && (
        <Card>
          <h3 className="font-bold text-sm text-muted mb-3">결정 사항</h3>
          <ul className="space-y-2">
            {summary.decisions.map((decision, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-green-600 shrink-0">&#10003;</span>
                <span>{decision}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 실행 항목 */}
      {summary.actionItems && summary.actionItems.length > 0 && (
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
                {summary.actionItems.map((item, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
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

      {/* 참석자 */}
      {summary.participants && summary.participants.length > 0 && (
        <Card>
          <h3 className="font-bold text-sm text-muted mb-2">참석자</h3>
          <div className="flex flex-wrap gap-2">
            {summary.participants.map((name, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-gray-100 rounded-md text-sm"
              >
                {name}
              </span>
            ))}
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
