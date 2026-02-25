import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { meetingId } = await params;
    const { db } = await connectToDatabase();
    const meeting = await db
      .collection("meetings")
      .findOne({ _id: new ObjectId(meetingId), userId: user.id });

    if (!meeting) {
      return NextResponse.json(
        { error: "회의록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(meeting);
  } catch (error) {
    console.error("회의록 조회 실패:", error);
    return NextResponse.json(
      { error: "회의록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { meetingId } = await params;
    const body = await request.json();
    const { title, summary } = body;

    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updateFields.title = title;
    if (summary !== undefined) updateFields.summary = summary;

    const { db } = await connectToDatabase();
    const result = await db.collection("meetings").findOneAndUpdate(
      { _id: new ObjectId(meetingId), userId: user.id },
      { $set: updateFields },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json(
        { error: "회의록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("회의록 수정 실패:", error);
    return NextResponse.json(
      { error: "회의록을 수정할 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { meetingId } = await params;
    const { db } = await connectToDatabase();
    const result = await db
      .collection("meetings")
      .deleteOne({ _id: new ObjectId(meetingId), userId: user.id });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "회의록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("회의록 삭제 실패:", error);
    return NextResponse.json(
      { error: "회의록을 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
