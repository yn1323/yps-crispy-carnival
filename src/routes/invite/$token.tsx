import { createFileRoute, useParams } from "@tanstack/react-router";
import { InviteAccept } from "@/src/components/features/User/InviteAccept";

// @ts-expect-error - ルート定義が自動生成されていないため型エラーを無視
export const Route = createFileRoute("/invite/$token")({
  component: RouteComponent,
});

function RouteComponent() {
  // @ts-expect-error - ルート定義が自動生成されていないため型エラーを無視
  const { token } = useParams({ from: "/invite/$token" });

  return <InviteAccept token={token} />;
}
