import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { searchMeetings } from "@/lib/openrouter";
import { getSessionUser } from "@/lib/auth-utils";

export const maxDuration = 60; // Vercel Hobby 플랜 최대 60초

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { projectId, query } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "프로젝트 ID가 필요합니다." },
        { status: 400 }
      );
    }

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "검색어를 입력해주세요." },
        { status: 400 }
      );
    }

    if (query.trim().length > 500) {
      return NextResponse.json(
        { error: "검색어는 500자 이내로 입력해주세요." },
        { status: 400 }
      );
    }

    // 해당 프로젝트의 완료된 회의록 조회
    const { db } = await connectToDatabase();
    const meetings = await db
      .collection("meetings")
      .find({
        projectId: new ObjectId(projectId),
        userId: user.id,
        status: "completed",
      })
      .sort({ createdAt: -1 })
      .toArray();

    if (meetings.length === 0) {
      return NextResponse.json({
        answer:
          "이 프로젝트에 완료된 회의록이 없습니다. 회의를 먼저 녹음해주세요.",
        sources: [],
        meetingsAnalyzed: 0,
      });
    }

    // LLM 검색 호출
    const result = await searchMeetings(query.trim(), meetings as never[]);

    return NextResponse.json({
      ...result,
      meetingsAnalyzed: meetings.length,
    });
  } catch (error) {
    console.error("검색 처리 오류:", error);
    return NextResponse.json(
      { error: "검색 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
