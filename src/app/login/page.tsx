"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function isInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  // 주요 인앱 브라우저 감지
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line|DaumApps|everytimeApp|SamsungBrowser\/(?!(\d+\.))/i.test(ua) ||
    // 일반적인 WebView 감지
    (/wv\)/.test(ua) && /Android/.test(ua));
}

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    setInApp(isInAppBrowser());
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/projects");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleOpenExternal = () => {
    const url = window.location.href;
    // Android intent로 외부 브라우저 열기
    window.location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
    // fallback: 일정 시간 후 그대로라면 Safari/기본 브라우저로 시도
    setTimeout(() => {
      window.open(url, "_system");
    }, 500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-sm w-full mx-4">
        <div className="bg-white rounded-2xl shadow-sm border border-border p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold mb-2">MyNote</h1>
          <p className="text-sm text-muted mb-8">
            회의를 녹음하고 AI가 자동으로 회의록을 작성합니다.
          </p>

          {inApp ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left">
                <p className="text-sm font-medium text-amber-800 mb-1">
                  외부 브라우저에서 열어주세요
                </p>
                <p className="text-xs text-amber-700">
                  인앱 브라우저에서는 Google 로그인이 제한됩니다.
                  Chrome, Safari 등 외부 브라우저에서 접속해주세요.
                </p>
              </div>
              <button
                onClick={handleOpenExternal}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg font-medium"
              >
                외부 브라우저로 열기
              </button>
              <p className="text-xs text-muted">
                또는 주소를 복사하여 브라우저에 직접 붙여넣기 해주세요.
              </p>
            </div>
          ) : (
            <button
              onClick={() => signIn("google", { callbackUrl: "/projects" })}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google 계정으로 로그인
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
