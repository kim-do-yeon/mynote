import { MeetingSummary } from "@/types";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SUMMARY_SYSTEM_PROMPT = `당신은 전문 회의록 작성자입니다. 제공된 회의 녹취록을 분석하여 구조화된 회의록을 작성합니다.

다음 규칙을 따라주세요:
1. 모든 내용은 한국어로 작성합니다.
2. 핵심 내용만 간결하게 정리합니다.
3. 화자가 구분되어 있다면 발언자 정보를 활용합니다.
4. 불명확한 내용은 추측하지 않고 "[불명확]"으로 표시합니다.
5. 실행 항목(Action Items)에는 가능한 한 담당자와 기한을 포함합니다.

반드시 아래 JSON 형식으로 응답하세요:
{
  "overview": "회의 전체 내용을 2-3문장으로 요약",
  "keyPoints": ["주요 논의 사항 1", "주요 논의 사항 2"],
  "decisions": ["결정 사항 1", "결정 사항 2"],
  "actionItems": [{"task": "할 일", "assignee": "담당자 또는 미정", "deadline": "기한 또는 미정"}],
  "participants": ["참석자1", "참석자2"]
}`;

const MEETING_SUMMARY_SCHEMA = {
  type: "object" as const,
  properties: {
    overview: {
      type: "string" as const,
      description: "회의 전체 내용을 2-3문장으로 요약한 개요",
    },
    keyPoints: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "주요 논의 사항 목록",
    },
    decisions: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "회의에서 결정된 사항 목록",
    },
    actionItems: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          task: { type: "string" as const },
          assignee: { type: "string" as const },
          deadline: { type: "string" as const },
        },
        required: ["task", "assignee", "deadline"],
      },
      description: "실행 항목 목록",
    },
    participants: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "참석자 목록",
    },
  },
  required: ["overview", "keyPoints", "decisions", "actionItems", "participants"],
};

export async function transcribeAudio(
  audioBase64: string,
  format: string = "ogg"
): Promise<string> {
  // base64 문자열 정제: data URI prefix 제거 및 유효하지 않은 문자 제거
  let cleanBase64 = audioBase64;
  if (cleanBase64.includes(",")) {
    cleanBase64 = cleanBase64.split(",").pop()!;
  }
  cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, "");

  // 패딩 보정
  const pad = cleanBase64.length % 4;
  if (pad) {
    cleanBase64 += "=".repeat(4 - pad);
  }

  if (!cleanBase64 || cleanBase64.length < 100) {
    throw new Error("오디오 데이터가 너무 짧거나 비어있습니다.");
  }

  const payload = {
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "다음 오디오 파일의 내용을 한국어로 정확하게 받아쓰기(전사)해 주세요. 화자가 여러 명이면 화자를 구분해 주세요. 오디오의 내용만 텍스트로 출력하고, 다른 설명은 하지 마세요. 오디오에서 아무 말도 들리지 않으면 '[무음]'이라고만 출력하세요.",
          },
          {
            type: "input_audio",
            input_audio: {
              data: cleanBase64,
              format: format,
            },
          },
        ],
      },
    ],
  };

  const bodyString = JSON.stringify(payload);
  const bodyBuffer = Buffer.from(bodyString, "utf-8");

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(bodyBuffer.byteLength),
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "MyNote",
    },
    body: bodyBuffer,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `전사 실패: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function summarizeTranscript(
  transcript: string
): Promise<MeetingSummary> {
  const summaryBody = JSON.stringify({
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content: SUMMARY_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `다음 회의 녹취록을 분석하고 구조화된 회의록을 작성해 주세요:\n\n${transcript}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "meeting_summary",
        strict: true,
        schema: MEETING_SUMMARY_SCHEMA,
      },
    },
  });
  const summaryBuffer = Buffer.from(summaryBody, "utf-8");

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(summaryBuffer.byteLength),
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "MyNote",
    },
    body: summaryBuffer,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `요약 실패: ${errorData.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  try {
    return JSON.parse(content) as MeetingSummary;
  } catch {
    // JSON 파싱 실패 시 기본 구조 반환
    return {
      overview: content,
      keyPoints: [],
      decisions: [],
      actionItems: [],
      participants: [],
    };
  }
}
