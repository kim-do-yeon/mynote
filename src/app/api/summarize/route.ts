import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { summarizeTranscript } from "@/lib/openrouter";
import { formatDateForTitle } from "@/lib/date-utils";
import { MeetingSummary } from "@/types";
import { getSessionUser } from "@/lib/auth-utils";

export const maxDuration = 60; // Vercel Hobby 플랜 최대 60초

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { transcript, projectId, audioDuration } = body;

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "전사된 텍스트가 없습니다." },
        { status: 400 }
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "프로젝트 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 텍스트 → 구조화된 요약
    let summary: MeetingSummary;
    try {
      summary = await summarizeTranscript(transcript);
    } catch (err) {
      console.error("요약 실패:", err);
      summary = {
        overview:
          transcript.substring(0, 200) +
          (transcript.length > 200 ? "..." : ""),
        keyPoints: [],
        decisions: [],
        actionItems: [],
      };
    }

    // MongoDB에 저장
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
      audioDuration: audioDuration || undefined,
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
    console.error("요약 파이프라인 오류:", error);
    return NextResponse.json(
      { error: "요약 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
