import { useAuth } from "@clerk/clerk-react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Top } from "@/src/components/features/Top";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const { isSignedIn } = useAuth();

  // 認証済みの場合、mypageにリダイレクト
  if (isSignedIn) {
    return <Navigate to="/mypage" />;
  }

  return (
    <Animation>
      <Top />
    </Animation>
  );
}
