import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/src/pages/privacy";
import { buildStaffPrivacyPageHead } from "@/src/pages/privacy/meta";

export const Route = createFileRoute("/privacy_/staff")({
  head: buildStaffPrivacyPageHead,
  component: StaffPrivacyRoute,
});

function StaffPrivacyRoute() {
  return <PrivacyPage audience="staff" />;
}
