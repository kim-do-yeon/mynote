import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// MongoDB 작업에 타임아웃을 적용하는 헬퍼
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function saveUserToDb(user: { email?: string | null; name?: string | null; image?: string | null }) {
  const { connectToDatabase } = await import("@/lib/mongodb");
  const { db } = await connectToDatabase();
  await db.collection("users").updateOne(
    { email: user.email },
    {
      $set: {
        name: user.name,
        image: user.image,
        provider: "google",
        updatedAt: new Date(),
      },
      $setOnInsert: {
        email: user.email,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function getUserIdFromDb(email: string): Promise<string | null> {
  const { connectToDatabase } = await import("@/lib/mongodb");
  const { db } = await connectToDatabase();
  const dbUser = await db.collection("users").findOne({ email });
  return dbUser ? dbUser._id.toString() : null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  debug: true,
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          await withTimeout(saveUserToDb(user), 4000);
        } catch (error) {
          console.error("사용자 저장 실패 (로그인은 계속 진행):", error);
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        try {
          const userId = await withTimeout(
            getUserIdFromDb(token.email!),
            4000
          );
          if (userId) {
            token.userId = userId;
          }
        } catch (error) {
          console.error("JWT 사용자 조회 실패:", error);
        }
      }
      if (!token.userId && token.email) {
        token.userId = `email:${token.email}`;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
