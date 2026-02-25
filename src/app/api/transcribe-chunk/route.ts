import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/openrouter";
import { getSessionUser } from "@/lib/auth-utils";

export const maxDuration = 60; // Vercel Hobby 플랜 최대 60초

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터가 너무 크거나 잘못되었습니다." },
        { status: 413 }
      );
    }

    const { audioBase64, audioFormat, chunkIndex, totalChunks } = body;

    if (!audioBase64) {
      return NextResponse.json(
        { error: "오디오 데이터가 없습니다." },
        { status: 400 }
      );
    }

    // Base64 크기 체크 (개별 chunk는 최대 20MB)
    const base64SizeMB = (audioBase64.length * 3) / 4 / 1024 / 1024;
    if (base64SizeMB > 20) {
      return NextResponse.json(
        { error: `오디오 chunk가 너무 큽니다 (${base64SizeMB.toFixed(1)}MB).` },
        { status: 413 }
      );
    }

    console.log(
      `[chunk ${chunkIndex + 1}/${totalChunks}] 전사 시작 (${base64SizeMB.toFixed(1)}MB)`
    );

    // 음성 → 텍스트 전사
    let transcript: string;
    try {
      transcript = await transcribeAudio(audioBase64, audioFormat || "webm");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[chunk ${chunkIndex + 1}] 전사 실패:`, errorMsg);
      return NextResponse.json(
        { error: `음성 인식에 실패했습니다: ${errorMsg}` },
        { status: 502 }
      );
    }

    console.log(
      `[chunk ${chunkIndex + 1}/${totalChunks}] 전사 완료 (${transcript.length}자)`
    );

    return NextResponse.json({
      chunkIndex,
      transcript: transcript || "",
    });
  } catch (error) {
    console.error("chunk 전사 오류:", error);
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
