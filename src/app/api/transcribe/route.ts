import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { transcribeAudio, summarizeTranscript } from "@/lib/openrouter";
import { formatDateForTitle } from "@/lib/date-utils";
import { MeetingSummary } from "@/types";
import { getSessionUser } from "@/lib/auth-utils";

export const maxDuration = 300; // 긴 녹음 파일의 전사+요약 처리를 위해 5분

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { audioBase64, audioFormat, projectId } = await request.json();

    if (!audioBase64) {
      return NextResponse.json(
        { error: "오디오 데이터가 없습니다." },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "프로젝트 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // Step 1: 음성 → 텍스트 전사
    let transcript: string;
    try {
      transcript = await transcribeAudio(audioBase64, audioFormat || "webm");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("전사 실패:", errorMsg);
      return NextResponse.json(
        { error: `음성 인식에 실패했습니다: ${errorMsg}` },
        { status: 502 }
      );
    }

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "음성을 인식할 수 없습니다. 더 선명하게 녹음해 주세요." },
        { status: 422 }
      );
    }

    // Step 2: 텍스트 → 구조화된 요약
    let summary: MeetingSummary;
    try {
      summary = await summarizeTranscript(transcript);
    } catch (err) {
      console.error("요약 실패:", err);
      // 요약 실패 시 전사 텍스트만으로 저장
      summary = {
        overview: transcript.substring(0, 200) + (transcript.length > 200 ? "..." : ""),
        keyPoints: [],
        decisions: [],
        actionItems: [],
        participants: [],
      };
    }

    // Step 3: MongoDB에 저장
    const { db } = await connectToDatabase();
    const now = new Date();
    const title = `${formatDateForTitle(now)} 회의록`;

    const meeting = {
      userId: user.id,
      projectId: new ObjectId(projectId),
      title,
      transcript,
      summary,
      status: "completed" as const,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("meetings").insertOne(meeting);

    return NextResponse.json({
      meetingId: result.insertedId.toString(),
      transcript,
      summary,
      title,
    });
  } catch (error) {
    console.error("전사 파이프라인 오류:", error);
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
