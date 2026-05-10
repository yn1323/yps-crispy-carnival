import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "@tanstack/react-router";
import { LandingPage } from "@/src/components/features/LandingPage";

export function HomePage() {
  const { isSignedIn, isLoaded } = useAuth();

  // Clerk のロード完了を待たず LP を返す。
  // - prerender 時も、初回 hydrate 時も、同じ <LandingPage /> を返すので hydration mismatch しない
  // - ログイン済み判定が取れた瞬間にだけ /dashboard へリダイレクト
  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" />;
  }

  return <LandingPage />;
}
