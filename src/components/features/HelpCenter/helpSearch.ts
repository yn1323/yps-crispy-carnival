import type { HelpIndexMetadata } from "./helpIndexData";
import { getHelpTask } from "./helpTasks";

const FIELD_WEIGHTS = {
  title: 16,
  keywords: 8,
  summary: 4,
  task: 2,
  body: 1,
} as const;

export function normalizeHelpSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, " ").trim();
}

export function searchHelpMetas(entries: readonly HelpIndexMetadata[], query: string): HelpIndexMetadata[] {
  const terms = normalizeHelpSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return [...entries];

  return entries
    .map((entry) => ({ entry, score: scoreHelpMeta(entry, terms) }))
    .filter((result): result is { entry: HelpIndexMetadata; score: number } => result.score !== undefined)
    .sort((left, right) => right.score - left.score || compareHelpMetas(left.entry, right.entry))
    .map(({ entry }) => entry);
}

function scoreHelpMeta(entry: HelpIndexMetadata, terms: string[]): number | undefined {
  const task = getHelpTask(entry.task);
  const fields = [
    [normalizeHelpSearchText(entry.title), FIELD_WEIGHTS.title],
    [normalizeHelpSearchText(entry.keywords.join(" ")), FIELD_WEIGHTS.keywords],
    [normalizeHelpSearchText(entry.summary), FIELD_WEIGHTS.summary],
    [
      normalizeHelpSearchText(
        [task?.title, task?.description, helpAudienceLabel(entry.audience)].filter(Boolean).join(" "),
      ),
      FIELD_WEIGHTS.task,
    ],
    [normalizeHelpSearchText(entry.bodyText), FIELD_WEIGHTS.body],
  ] as const;

  let score = 0;
  for (const term of terms) {
    const matchedField = fields.find(([text]) => text.includes(term));
    if (!matchedField) return undefined;
    score += matchedField[1];
  }
  return score;
}

function compareHelpMetas(left: HelpIndexMetadata, right: HelpIndexMetadata): number {
  const leftTaskOrder = getHelpTask(left.task)?.order ?? Number.MAX_SAFE_INTEGER;
  const rightTaskOrder = getHelpTask(right.task)?.order ?? Number.MAX_SAFE_INTEGER;
  return (
    leftTaskOrder - rightTaskOrder ||
    helpKindOrder(left.kind) - helpKindOrder(right.kind) ||
    left.order - right.order ||
    left.id.localeCompare(right.id)
  );
}

function helpKindOrder(kind: HelpIndexMetadata["kind"]): number {
  return kind === "faq" ? 0 : 1;
}

function helpAudienceLabel(audience: HelpIndexMetadata["audience"]): string {
  if (audience === "manager") return "管理者 シフト担当者";
  if (audience === "staff") return "スタッフ";
  return "すべて 全員 管理者 スタッフ";
}
