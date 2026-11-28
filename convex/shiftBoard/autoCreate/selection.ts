import type { AutoCreateHistory } from "./history";
import type { AutoCreateSkillLevel, AutoCreateStaff } from "./types";

// 候補が必要人数より多いときに、誰を選ぶかの順を決める。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/** 目安の割合の下限。過去に1日も入っていない人が、選ばれないままにならないようにする。 */
const MIN_TARGET_RATIO = 0.1;

export type SelectionContext = {
  /**
   * 目安の量（今回希望した量 × 目安の割合）。
   * 量の単位は、勤務の長さがそろう日付選択とパターン選択では日数、長さがまちまちになる時間指定では15分のマスの数である。
   * 時間指定の「今回希望した量」は、希望した長さではなく、必要人数を希望者の数で分けた取り分で数える。
   */
  targetAmounts: Map<string, number>;
  /** 今回これまでに入った勤務の量。入れるたびに増やす。 */
  assignedAmounts: Map<string, number>;
  /**
   * 今回、希望した日に勤務が入らないことが、いま何日続いているか。時間指定でだけ数える。
   * 勤務時間の合計が同じでも、入れない日が続く人が出ないよう、日ごとに交代させるために使う。
   */
  unassignedStreaks: Map<string, number>;
  /** 勤務が入らない日が1日続くごとに、今回入った量から引いて比べる量。0なら、続いた日数を比べない。 */
  unassignedStreakAmount: number;
  /** 直近の1回で、希望が通らなかった日数。 */
  lastUnmetDays: Map<string, number>;
  /** 過去にそのポジションへ入った日数。 */
  positionDays: Map<string, Map<string, number>>;
  /** 同じ条件の人から選ぶための値。スタッフのIDと募集の開始日から作る。 */
  tieBreak: Map<string, number>;
  skills: Map<string, Map<string, AutoCreateSkillLevel>>;
};

/** FNV-1aの32bit。同じ文字列からは同じ値になり、並び順に左右されない。 */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 選ぶ順に使う値を、スタッフごとに用意する。
 * 目安の割合は、本人の過去の割合と、店舗全体の過去の割合の平均にする。
 * 本人の過去がなければ店舗全体の割合を使い、店舗に過去がなければ全員を同じ割合にする。
 */
export function buildSelectionContext(input: {
  staffs: readonly AutoCreateStaff[];
  /** 今回、勤務を入れられる所のうち、希望した量。日付選択とパターン選択は日数、時間指定は取り分（15分のマスの数）。 */
  requestedAmounts: ReadonlyMap<string, number>;
  /** 時間指定で、勤務が入らない日が1日続くごとに、今回入った量から引いて比べる量。渡さない場合は、続いた日数を比べない。 */
  unassignedStreakAmount?: number;
  history: AutoCreateHistory | null;
  periodStart: string;
}): SelectionContext {
  const historyByStaffId = new Map((input.history?.staffs ?? []).map((staff) => [staff.staffId, staff]));
  let shopRequestedDays = 0;
  let shopAssignedDays = 0;
  for (const staff of historyByStaffId.values()) {
    shopRequestedDays += staff.requestedDays;
    shopAssignedDays += staff.assignedDays;
  }
  const shopRatio = shopRequestedDays > 0 ? shopAssignedDays / shopRequestedDays : 1;

  const context: SelectionContext = {
    targetAmounts: new Map(),
    assignedAmounts: new Map(),
    unassignedStreaks: new Map(),
    unassignedStreakAmount: input.unassignedStreakAmount ?? 0,
    lastUnmetDays: new Map(),
    positionDays: new Map(),
    tieBreak: new Map(),
    skills: new Map(),
  };
  for (const staff of input.staffs) {
    const history = historyByStaffId.get(staff.id);
    const ownRatio = history && history.requestedDays > 0 ? history.assignedDays / history.requestedDays : shopRatio;
    const ratio = Math.max((ownRatio + shopRatio) / 2, MIN_TARGET_RATIO);
    context.targetAmounts.set(staff.id, (input.requestedAmounts.get(staff.id) ?? 0) * ratio);
    context.assignedAmounts.set(staff.id, 0);
    context.lastUnmetDays.set(staff.id, history ? history.lastRequestedDays - history.lastAssignedDays : 0);
    context.positionDays.set(
      staff.id,
      new Map((history?.positions ?? []).map((position) => [position.positionId, position.days])),
    );
    context.tieBreak.set(staff.id, hashText(`${input.periodStart}:${staff.id}`));
    context.skills.set(staff.id, new Map(staff.positionSkills.map((skill) => [skill.positionId, skill.level])));
  }
  return context;
}

export function isUnavailable(context: SelectionContext, staffId: string, positionId: string): boolean {
  return context.skills.get(staffId)?.get(positionId) === "unavailable";
}

export function isNewcomer(context: SelectionContext, staffId: string, positionId: string): boolean {
  return context.skills.get(staffId)?.get(positionId) === "newcomer";
}

/** 入った勤務の量を足す。勤務を縮めたときは、負の値を渡して減らす。 */
export function addAssignedAmount(context: SelectionContext, staffId: string, amount: number): void {
  context.assignedAmounts.set(staffId, (context.assignedAmounts.get(staffId) ?? 0) + amount);
}

/** 希望した日の結果を記録する。勤務が入れば続きを0に戻し、入らなければ1日足す。 */
export function recordRequestedDay(context: SelectionContext, staffId: string, isAssigned: boolean): void {
  context.unassignedStreaks.set(staffId, isAssigned ? 0 : (context.unassignedStreaks.get(staffId) ?? 0) + 1);
}

/**
 * 2人のうち、先に選ぶほうを負の値で返す。
 * 目安に対して入った量の少ない人、直近の1回で希望が通らなかった日数の多い人、
 * 過去にそのポジションへ入った日数の多い人、の順に比べる。
 * 時間指定では、勤務が入らない日が続いている人の入った量を、続いた日数ぶん少なく数える。
 */
export function compareCandidates(context: SelectionContext, positionId: string, a: string, b: string): number {
  // 割合どうしの比較を、割り算をせずに掛け算で行う。目安の量は下限があるため0にならない。
  // 勤務が入らない日が続いている人は、その日数ぶんだけ、入った量を少なく数える。
  const amountOf = (staffId: string) =>
    (context.assignedAmounts.get(staffId) ?? 0) -
    context.unassignedStreakAmount * (context.unassignedStreaks.get(staffId) ?? 0);
  const progress =
    amountOf(a) * (context.targetAmounts.get(b) ?? 0) - amountOf(b) * (context.targetAmounts.get(a) ?? 0);
  if (progress !== 0) return progress;

  const unmet = (context.lastUnmetDays.get(b) ?? 0) - (context.lastUnmetDays.get(a) ?? 0);
  if (unmet !== 0) return unmet;

  const familiar =
    (context.positionDays.get(b)?.get(positionId) ?? 0) - (context.positionDays.get(a)?.get(positionId) ?? 0);
  if (familiar !== 0) return familiar;

  const tie = (context.tieBreak.get(a) ?? 0) - (context.tieBreak.get(b) ?? 0);
  if (tie !== 0) return tie;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 候補から1人を選ぶ。候補がいなければnullを返す。
 * `prefersNonNewcomer`がtrueのときは、そのポジションで見習いでない人を先に選び、いなければ見習いから選ぶ。
 */
export function pickCandidate(
  context: SelectionContext,
  positionId: string,
  candidates: readonly string[],
  options: { prefersNonNewcomer: boolean },
): string | null {
  if (candidates.length === 0) return null;
  const nonNewcomers = options.prefersNonNewcomer
    ? candidates.filter((staffId) => !isNewcomer(context, staffId, positionId))
    : [];
  const pool = nonNewcomers.length > 0 ? nonNewcomers : candidates;
  return pool.reduce((best, staffId) => (compareCandidates(context, positionId, staffId, best) < 0 ? staffId : best));
}
