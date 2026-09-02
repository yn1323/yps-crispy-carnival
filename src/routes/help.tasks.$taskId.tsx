import { createFileRoute } from "@tanstack/react-router";
import { HelpTaskPage } from "@/src/pages/help/task";
import { buildHelpTaskPageHead } from "@/src/pages/help/taskMeta";

export const Route = createFileRoute("/help/tasks/$taskId")({
  head: ({ params }) => buildHelpTaskPageHead(params.taskId),
  component: HelpTaskRoute,
});

function HelpTaskRoute() {
  const { taskId } = Route.useParams();
  return <HelpTaskPage taskId={taskId} />;
}
