import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/src/pages/privacy";
import { buildGeneralPrivacyPageHead } from "@/src/pages/privacy/meta";

export const Route = createFileRoute("/privacy")({
  head: buildGeneralPrivacyPageHead,
  component: PrivacyPage,
});
