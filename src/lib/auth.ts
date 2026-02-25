import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
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
          // Edge Runtime 호환을 위해 동적 import
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
        } catch (error) {
          console.error("사용자 저장 실패:", error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      // 최초 로그인 시 MongoDB에서 userId를 가져와 토큰에 저장
      if (account) {
        try {
          const { connectToDatabase } = await import("@/lib/mongodb");
          const { db } = await connectToDatabase();
          const dbUser = await db
            .collection("users")
            .findOne({ email: token.email });
          if (dbUser) {
            token.userId = dbUser._id.toString();
          }
        } catch (error) {
          console.error("JWT 사용자 조회 실패:", error);
        }
      }
      return token;
    },
    async session({ session, token }) {
      // JWT 토큰에 저장된 userId를 세션에 주입
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
