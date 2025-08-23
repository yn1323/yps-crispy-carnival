import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/src/helpers/utils/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  if (
    request.nextUrl.pathname.endsWith(".svg") ||
    request.nextUrl.pathname.endsWith(".png") ||
    request.nextUrl.pathname.endsWith(".jpg") ||
    request.nextUrl.pathname.endsWith(".jpeg") ||
    request.nextUrl.pathname.endsWith(".gif") ||
    request.nextUrl.pathname.endsWith(".webp")
  ) {
    return supabaseResponse;
  }

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getEnv();

  const supabase = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });
  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 認証なしページ
  const publicPaths = ["/"];

  // 認証操作ページ
  const authOperationPaths = ["/signin", "/signin/signup", "/signin/forget"];

  const isApi = request.nextUrl.pathname.startsWith("/api");

  // API は認証が必要
  if (isApi) {
    if (user) {
      return supabaseResponse;
    }
    // 認証されていないユーザーがAPIを叩いた場合は401を返す
    return new Response("Unauthorized", { status: 401 });
  }

  // 認証が必要ページ（上記以外すべてが該当）
  // const authPaths = ['/dashboard'];

  // 認証なしで認証なしページを見ようとしている
  if (publicPaths.includes(request.nextUrl.pathname)) {
    return supabaseResponse;
  }

  // 認証なし + 認証操作ページを見ようとしている
  if (!user && authOperationPaths.includes(request.nextUrl.pathname)) {
    return supabaseResponse;
  }

  // 認証あり + 認証操作なしページを見ようとしている
  if (user && authOperationPaths.includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/mypage";
    return NextResponse.redirect(url);
  }

  // 認証なし  + 認証必要ページを見ようとしている
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  // =============================
  // 初回ログインユーザー判定
  // =============================
  if (user) {
    const USER_REGISTERED_COOKIE = "user_registered";
    const isUserConfigPath = request.nextUrl.pathname.startsWith("/config/user");

    // Cookieから登録状態を確認
    const isRegisteredCookie = request.cookies.get(USER_REGISTERED_COOKIE);
    let alreadyRegistered = false;

    if (isRegisteredCookie?.value === "true") {
      // Cookieに登録済み情報がある場合はDBアクセスをスキップ
      alreadyRegistered = true;
    } else {
      // 初回のみDB確認
      const { data: registeredUser, error } = await supabase
        .from("User")
        .select("userId, userName")
        .eq("userId", user.id)
        .maybeSingle();

      if (error) {
        console.error("Database error:", error);
      }

      alreadyRegistered = !error && !!registeredUser;

      // 結果をCookieに保存（有効期限付き）
      if (alreadyRegistered) {
        supabaseResponse.cookies.set(USER_REGISTERED_COOKIE, "true", {
          maxAge: 60 * 60 * 24 * 7, // 1週間
          httpOnly: true,
          secure: true,
        });
      }
    }

    // ユーザー登録状態をヘッダーに追加
    supabaseResponse.headers.set("x-user-registered", alreadyRegistered.toString());

    // 未登録ユーザーが /config 以外へアクセスしようとしたら /config へリダイレクト
    if (!alreadyRegistered && !isUserConfigPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/config/user";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
