import { createFileRoute } from "@tanstack/react-router";
import { Terms } from "@/src/components/features/Terms";

export const Route = createFileRoute("/terms")({
  component: Terms,
});
