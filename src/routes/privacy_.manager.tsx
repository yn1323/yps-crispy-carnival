import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/src/pages/privacy";
import { buildManagerPrivacyPageHead } from "@/src/pages/privacy/meta";

export const Route = createFileRoute("/privacy_/manager")({
  head: buildManagerPrivacyPageHead,
  component: ManagerPrivacyRoute,
});

function ManagerPrivacyRoute() {
  return <PrivacyPage audience="manager" />;
}
