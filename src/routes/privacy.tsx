import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicy } from "@/src/components/features/PrivacyPolicy";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
});
