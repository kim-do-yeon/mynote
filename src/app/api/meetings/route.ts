import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const { db } = await connectToDatabase();

    const filter: Record<string, unknown> = { userId: user.id };
    if (projectId) {
      filter.projectId = new ObjectId(projectId);
    }

    const meetings = await db
      .collection("meetings")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(meetings);
  } catch (error) {
    console.error("회의록 목록 조회 실패:", error);
    return NextResponse.json(
      { error: "회의록 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
