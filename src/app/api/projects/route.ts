import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const projects = await db
      .collection("projects")
      .find({ userId: user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(projects);
  } catch (error) {
    console.error("프로젝트 목록 조회 실패:", error);
    return NextResponse.json(
      { error: "프로젝트 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "프로젝트 이름을 입력해주세요." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const now = new Date();
    const result = await db.collection("projects").insertOne({
      userId: user.id,
      name: name.trim(),
      description: description?.trim() || "",
      createdAt: now,
      updatedAt: now,
    });

    const project = await db
      .collection("projects")
      .findOne({ _id: result.insertedId });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("프로젝트 생성 실패:", error);
    return NextResponse.json(
      { error: "프로젝트를 생성할 수 없습니다." },
      { status: 500 }
    );
  }
}
