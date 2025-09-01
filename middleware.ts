import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getRegisterInfoFromMiddleware } from "@/src/helpers/auth/registerUser";

// パブリックルート（認証不要）を定義
const isPublicRoute = createRouteMatcher(["/", "/logout"]);
// TOPページのルートマッチャー
const isHomeRoute = createRouteMatcher(["/"]);
// プロフィール登録ページのルートマッチャー
const isJoinUserRoute = createRouteMatcher(["/join/user"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  // サインイン済みユーザーがTOPページにアクセスした場合のリダイレクト
  if (isHomeRoute(req)) {
    if (userId) {
      return NextResponse.redirect(new URL("/mypage", req.url));
    }
  }

  if (!isPublicRoute(req)) {
    // パブリックルート以外は認証を必須にする
    await auth.protect();

    // 認証されているがuserIdがない場合
    if (!userId) {
      return NextResponse.redirect(new URL("/logout", req.url));
    }

    // ClerkのmetaDataからhasProfileを取得
    const isRegistered = await getRegisterInfoFromMiddleware(userId);

    // プロフィール未完了で登録ページ以外にアクセスした場合
    if (!isRegistered && !isJoinUserRoute(req)) {
      return NextResponse.redirect(new URL("/join/user", req.url));
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
