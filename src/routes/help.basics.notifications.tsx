import { createFileRoute } from "@tanstack/react-router";
import { HelpNotificationBasicsPage } from "@/src/pages/help/notificationBasics";
import { buildHelpNotificationBasicsPageHead } from "@/src/pages/help/notificationBasicsMeta";

export const Route = createFileRoute("/help/basics/notifications")({
  head: buildHelpNotificationBasicsPageHead,
  component: HelpNotificationBasicsPage,
});
