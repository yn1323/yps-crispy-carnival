import { faqMetas } from "./helpMeta";
import { getHelpTask, getHelpTaskHref } from "./helpTasks";

const legacyHelpHashRedirects: Readonly<Record<string, string>> = {
  "first-steps": "/help/scenarios/shift-management",
  "choose-staff-status-change": "/help/tasks/staff-management",
  "task-getting-started": "/help/scenarios/shift-management",
};

export function resolveLegacyHelpHash(hash: string): string | undefined {
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return undefined;
  }

  if (!id) return undefined;

  const legacyHref = legacyHelpHashRedirects[id];
  if (legacyHref) return legacyHref;

  if (id.startsWith("task-")) {
    const task = getHelpTask(id.slice("task-".length));
    return task ? getHelpTaskHref(task.id) : undefined;
  }

  return faqMetas.find((faq) => faq.id === id)?.href;
}
