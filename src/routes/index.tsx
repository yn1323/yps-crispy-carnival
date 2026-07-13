import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/src/pages/home";
import { buildHomePageHead } from "@/src/pages/home/meta";

export const Route = createFileRoute("/")({
  head: buildHomePageHead,
  component: HomePage,
});
