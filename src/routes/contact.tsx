import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/src/pages/contact";
import { buildContactPageHead } from "@/src/pages/contact/meta";

export const Route = createFileRoute("/contact")({
  head: buildContactPageHead,
  component: ContactPage,
});
