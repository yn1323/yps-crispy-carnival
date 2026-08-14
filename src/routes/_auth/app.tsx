import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/app")({
  staticData: { appShell: { mode: "navigation", activeKey: "home" } },
  beforeLoad: () => {
    throw redirect({ to: "/app/home", replace: true });
  },
});
