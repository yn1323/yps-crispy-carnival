import { jaJP } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/react";
import type { ReactNode } from "react";
import { CLERK_PUBLISHABLE_KEY, CONVEX_URL } from "@/src/configs/authEnv";
import { ConvexClientProvider } from "@/src/providers/ConvexProvider";

/**
 * Clerk + Convex をまとめた認証系プロバイダ。
 * LP・記事・利用規約などの公開ページに Clerk/Convex のバンドルを載せないため、
 * root documentではなく認証が必要なレイアウト/ページ単位でラップする。
 * ConvexReactClient はモジュールシングルトン（ConvexProvider.tsx の getClient）なので、
 * レイアウト間の遷移でプロバイダが再マウントされても WebSocket 接続は維持される。
 */
export const AuthProviders = ({ children }: { children: ReactNode }) => (
  <ClerkProvider
    publishableKey={CLERK_PUBLISHABLE_KEY}
    localization={jaJP}
    signInUrl="/login"
    signUpUrl="/signup"
    signInFallbackRedirectUrl="/dashboard"
    signUpFallbackRedirectUrl="/dashboard"
  >
    <ConvexClientProvider env={CONVEX_URL}>{children}</ConvexClientProvider>
  </ClerkProvider>
);
