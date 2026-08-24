export type PeopleCapacityResolution =
  | {
      kind: "choosePaidPlan";
      current: number;
      max: number;
    }
  | {
      kind: "contact";
      current: number;
      max: number;
    }
  | {
      kind: "limitReached";
      current: number;
      max: number;
    };

const PEOPLE_CAPACITY_ERROR_PREFIX = "利用人数が現在のプラン上限を超えます";
const USAGE_PATTERN = /現在\s*(\d+)名(?:\s*[／/]\s*|\s*、\s*)上限\s*(\d+)名/;

/**
 * 追加系mutationで共通化している安定したエラー文言を、画面に依存しない解決方法へ変換する。
 * 認可と上限判定の正は引き続きConvex側に置き、frontendでは次の行動だけを組み立てる。
 */
export function classifyPeopleCapacityError(message: string | undefined): PeopleCapacityResolution | null {
  if (!message) return null;
  if (!message.includes(PEOPLE_CAPACITY_ERROR_PREFIX)) return null;

  const usage = message.match(USAGE_PATTERN);
  if (!usage) return null;
  const current = Number(usage[1]);
  const max = Number(usage[2]);
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(max)) return null;

  return resolvePeopleCapacityLimit(current, max);
}

export function resolvePeopleCapacityLimit(current: number, max: number): PeopleCapacityResolution {
  // 旧Free上限のerrorが段階的なbackend更新中に返っても、BusinessではなくProへ案内する。
  if (max === 4 || max === 5) return { kind: "choosePaidPlan", current, max };
  if (max === 50) return { kind: "limitReached", current, max };
  return { kind: "contact", current, max };
}
