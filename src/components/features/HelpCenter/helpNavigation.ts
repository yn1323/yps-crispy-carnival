import { faqMetas } from "./helpMeta";
import { getHelpTask, getHelpTaskHref } from "./helpTasks";

export function resolveLegacyHelpHash(hash: string): string | undefined {
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return undefined;
  }

  if (!id) return undefined;

  if (id.startsWith("task-")) {
    const task = getHelpTask(id.slice("task-".length));
    return task ? getHelpTaskHref(task.id) : undefined;
  }

  return faqMetas.find((faq) => faq.id === id)?.href;
}
