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
          console.error("사용자 저장 실패 (로그인은 계속 진행):", error);
          // DB 실패해도 로그인은 허용
        }
      }
      return true;
    },
    async jwt({ token, account }) {
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
      // DB에서 userId를 못 가져왔으면 이메일 해시를 대체 ID로 사용
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
