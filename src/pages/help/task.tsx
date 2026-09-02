import { HelpTask } from "@/src/components/features/HelpCenter/HelpTask";

export function HelpTaskPage({ taskId }: { taskId: string }) {
  return <HelpTask taskId={taskId} />;
}
