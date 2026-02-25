"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function Header() {
  const { data: session } = useSession();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="border-b border-border bg-card sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/projects" className="text-lg font-bold text-primary">
            MyNote
          </Link>
          <span className="ml-2 text-xs text-muted">회의록 자동화</span>
        </div>

        {session?.user && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-8 h-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  {session.user.name?.charAt(0) || "U"}
                </div>
              )}
              <span className="text-sm font-medium hidden sm:block">
                {session.user.name}
              </span>
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-border py-1 z-20">
                  <div className="px-4 py-2 border-b border-border">
                    <p className="text-sm font-medium truncate">
                      {session.user.name}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {session.user.email}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-gray-50 transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
