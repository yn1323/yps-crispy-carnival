import { createFileRoute } from "@tanstack/react-router";
import { NotFoundPage } from "@/src/pages/not-found";
import { buildNotFoundPageHead } from "@/src/pages/not-found/meta";

export const Route = createFileRoute("/$")({
  head: buildNotFoundPageHead,
  component: NotFoundPage,
});
