import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { projectId } = await params;
    const { db } = await connectToDatabase();
    const project = await db
      .collection("projects")
      .findOne({ _id: new ObjectId(projectId), userId: user.id });

    if (!project) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("프로젝트 조회 실패:", error);
    return NextResponse.json(
      { error: "프로젝트를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "프로젝트 이름을 입력해주세요." },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const result = await db.collection("projects").findOneAndUpdate(
      { _id: new ObjectId(projectId), userId: user.id },
      {
        $set: {
          name: name.trim(),
          description: description?.trim() || "",
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("프로젝트 수정 실패:", error);
    return NextResponse.json(
      { error: "프로젝트를 수정할 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { projectId } = await params;
    const { db } = await connectToDatabase();
    const oid = new ObjectId(projectId);

    // 본인의 프로젝트만 삭제
    const result = await db
      .collection("projects")
      .deleteOne({ _id: oid, userId: user.id });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 연관된 회의록도 삭제
    await db.collection("meetings").deleteMany({ projectId: oid, userId: user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("프로젝트 삭제 실패:", error);
    return NextResponse.json(
      { error: "프로젝트를 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
