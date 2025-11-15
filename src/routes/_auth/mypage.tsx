import { createFileRoute } from "@tanstack/react-router";
import { MyPage as MyPageFeature } from "@/src/components/features/MyPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/mypage")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <MyPageFeature />
    </Animation>
  );
}
