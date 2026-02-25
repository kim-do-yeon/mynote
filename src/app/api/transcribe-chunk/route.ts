import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/openrouter";
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

    // FormData로 수신 (multipart/form-data)
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터를 파싱할 수 없습니다." },
        { status: 400 }
      );
    }

    const audioFile = formData.get("audio") as File | null;
    const audioFormat = (formData.get("audioFormat") as string) || "webm";
    const chunkIndex = parseInt(
      (formData.get("chunkIndex") as string) || "0",
      10
    );
    const totalChunks = parseInt(
      (formData.get("totalChunks") as string) || "1",
      10
    );

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json(
        { error: "오디오 데이터가 없습니다." },
        { status: 400 }
      );
    }

    const fileSizeMB = audioFile.size / 1024 / 1024;
    console.log(
      `[chunk ${chunkIndex + 1}/${totalChunks}] 전사 시작 (${fileSizeMB.toFixed(2)}MB, ${audioFormat})`
    );

    // File → ArrayBuffer → Base64 변환 (서버에서 수행)
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // 음성 → 텍스트 전사
    let transcript: string;
    try {
      transcript = await transcribeAudio(base64, audioFormat);
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
