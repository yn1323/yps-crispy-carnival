import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { addDays, generateDateRange, getWeekday } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { generateUUID } from "../_lib/uuid";
import { getLegalConsentVersions } from "../legal/documents";
import { recordStaffLegalConsent } from "../legal/service";
import {
  listActiveStaffsForOrganizationPerson,
  upsertLineProviderUser,
  upsertOrganizationPersonLineLink,
  upsertStaffLineAccount,
} from "../line/service";
import { buildConfirmationSnapshotSignature } from "../notification/confirmationSnapshots";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { calculateTrialEndsAt } from "../organizationBilling/policy";
import { resolveRecruitmentStaffingDays } from "../shiftSetup/service";
import { insertNotificationRecords } from "./notificationRecords";
import { userSeedCoManagerAuthTokenIdentifier } from "./service";

// 確認用データの中身。DBへ直接書き、通知やcronの予約（scheduler）は使わない。
// スタッフのメールアドレスは@example.comにし、管理者本人のメールアドレスへは何も送らない。

export const USER_SEED_ORGANIZATION_NAME = "シフトリ確認用グループ";

export const USER_SEED_STAFF_NAMES = [
  "佐藤 健太",
  "鈴木 美咲",
  "高橋 翔",
  "田中 結衣",
  "伊藤 大輔",
  "渡辺 彩花",
  "山本 拓海",
  "中村 さくら",
  "小林 悠斗",
  "加藤 愛",
  "吉田 蓮",
  "山田 陽菜",
  "佐々木 颯",
  "山口 美月",
  "松本 大和",
  "井上 七海",
  "木村 湊",
  "林 心春",
  "清水 陸",
  "森 莉子",
] as const;

export const USER_SEED_STAFF_EMAIL_DOMAIN = "example.com";

/** 管理者本人のほかに入れる管理者。ユーザーの行はログインできない識別子で作る。 */
export const USER_SEED_CO_MANAGERS = [
  { name: "石川 誠", email: `devmanager01@${USER_SEED_STAFF_EMAIL_DOMAIN}` },
  { name: "藤井 香織", email: `devmanager02@${USER_SEED_STAFF_EMAIL_DOMAIN}` },
  { name: "岡田 修", email: `devmanager03@${USER_SEED_STAFF_EMAIL_DOMAIN}` },
] as const;

/** `/seed`の店舗ごとに、シフトの対象から外すスタッフの数。 */
export const USER_SEED_EXCLUDED_STAFF_COUNT = 3;

/** LINE連携済みにするスタッフの数。 */
export const USER_SEED_LINE_LINKED_STAFF_COUNT = 8;

/** シフトの対象から外す人。`managers`の"self"は管理者本人、数字は`USER_SEED_CO_MANAGERS`の位置。 */
export type ShiftExclusion = { staffCount: number; managers: ReadonlyArray<"self" | number> };

/** `/seed`の店舗ごとの、シフトの対象から外す管理者。本人もほかの管理者も、どこか1店舗で外れる。 */
const USER_SEED_EXCLUDED_MANAGERS: Record<ShopKey, ShiftExclusion["managers"]> = {
  time: [1],
  dateOnly: ["self", 2],
  shiftType: [0],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 日付選択の勤務は時刻を持たないため、シフト表と同じ既定の受付時間で保存する。 */
const DATE_ONLY_ASSIGNMENT_TIME: Slot = { startTime: "09:00", endTime: "22:00" };

type Weekday = Doc<"shops">["regularClosedDays"][number];
const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const weekdayOf = (date: string): Weekday => WEEKDAYS[getWeekday(date)];

export type Random = () => number;

/** 同じ値からは同じ並びを返す乱数。投入した内容を作り直せるよう、使った値を結果に返す。 */
export function createSeedRandom(seed: number): Random {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(random: Random, items: readonly T[]): T => items[Math.floor(random() * items.length)];
const randomInt = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
export function shuffle<T>(random: Random, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
export const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// ---------- 店舗の定義 ----------

type ShopKey = "time" | "dateOnly" | "shiftType";

export type ShopDefinition = {
  key: ShopKey;
  name: string;
  pattern: ShiftSubmissionPattern;
  regularClosedDays: Weekday[];
  breakRule: { minWorkMinutes: number; breakMinutes: number };
  positions: Array<{ name: string; color: string }>;
  /** 希望を出す日の割合。 */
  workRate: number;
  /** スタッフの全員をシフトの対象にする。省くと、`insertShop`へ渡した数（既定は1人）をシフトの対象から外す。 */
  keepsAllStaffInShift?: boolean;
};

const SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
    { id: "night", name: "夜番", startTime: "18:00", endTime: "24:00", sortOrder: 2 },
  ],
};

export const USER_SEED_SHOPS: readonly ShopDefinition[] = [
  {
    key: "time",
    name: "時間指定",
    pattern: { kind: "time", startTime: "06:00", endTime: "24:00" },
    regularClosedDays: [],
    breakRule: { minWorkMinutes: 360, breakMinutes: 60 },
    positions: [
      { name: "ホール", color: "#60a5fa" },
      { name: "キッチン", color: "#fb923c" },
    ],
    workRate: 0.5,
  },
  {
    key: "dateOnly",
    name: "日付選択",
    pattern: { kind: "dateOnly" },
    regularClosedDays: ["thu"],
    breakRule: { minWorkMinutes: 480, breakMinutes: 60 },
    positions: [
      { name: "販売", color: "#60a5fa" },
      { name: "製造", color: "#fb923c" },
    ],
    workRate: 0.55,
  },
  {
    key: "shiftType",
    name: "パターン選択",
    pattern: SHIFT_TYPE_PATTERN,
    regularClosedDays: ["mon", "tue"],
    breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
    positions: [
      { name: "ホール", color: "#60a5fa" },
      { name: "キッチン", color: "#fb923c" },
      { name: "ドリンク", color: "#a78bfa" },
    ],
    workRate: 0.55,
  },
];

// ---------- 募集の期間 ----------

export type UserSeedRecruitmentKey = "confirmedPast" | "confirmedChanged" | "draft" | "recruiting";

export type RecruitmentWindow = {
  key: UserSeedRecruitmentKey;
  status: "open" | "confirmed";
  deadline: string;
  periodStart: string;
  periodEnd: string;
  /** 提出しない人の数。募集中は割合で決める。 */
  unsubmittedCount: number | "random";
  /** 確定して通知した日が、実行した日の何日前か。確定済みの募集だけが持つ。 */
  confirmedDaysAgo?: number;
};

/** 実行した日を基準に、重ならない4つの期間を置く。今日は「確定後に変更あり」の期間に入る。 */
export function buildUserSeedRecruitmentWindows(today: string): RecruitmentWindow[] {
  return [
    {
      key: "confirmedPast",
      status: "confirmed",
      deadline: addDays(today, -13),
      periodStart: addDays(today, -10),
      periodEnd: addDays(today, -4),
      unsubmittedCount: 1,
      confirmedDaysAgo: 12,
    },
    {
      key: "confirmedChanged",
      status: "confirmed",
      deadline: addDays(today, -6),
      periodStart: addDays(today, -3),
      periodEnd: addDays(today, 3),
      unsubmittedCount: 1,
      confirmedDaysAgo: 5,
    },
    {
      key: "draft",
      status: "open",
      deadline: addDays(today, -1),
      periodStart: addDays(today, 4),
      periodEnd: addDays(today, 10),
      unsubmittedCount: 2,
    },
    {
      key: "recruiting",
      status: "open",
      deadline: addDays(today, 6),
      periodStart: addDays(today, 11),
      periodEnd: addDays(today, 24),
      unsubmittedCount: "random",
    },
  ];
}

// ---------- 希望とメモ ----------

export type Slot = { startTime: string; endTime: string; optionId?: string };

/** 休む日のメモ。この日には希望を入れない。 */
export const USER_SEED_OFF_NOTES = ["この日は休みたいです", "終日入れません", "人が足りなければ連絡ください"];

const TIME_BASE_SLOTS: Record<string, Slot[]> = {
  early: [
    { startTime: "06:00", endTime: "12:00" },
    { startTime: "07:00", endTime: "13:00" },
    { startTime: "06:00", endTime: "11:00" },
  ],
  day: [
    { startTime: "09:00", endTime: "15:00" },
    { startTime: "10:00", endTime: "16:00" },
    { startTime: "11:00", endTime: "17:00" },
    { startTime: "10:30", endTime: "15:30" },
  ],
  late: [
    { startTime: "16:00", endTime: "22:00" },
    { startTime: "17:00", endTime: "23:00" },
    { startTime: "17:30", endTime: "22:00" },
  ],
  night: [
    { startTime: "18:00", endTime: "24:00" },
    { startTime: "19:00", endTime: "24:00" },
  ],
};

export type Preferences = {
  /** 時間指定とパターン選択の希望。日付選択では空。 */
  slotsByDate: Map<string, Slot[]>;
  /** 出勤を希望した日。日付選択の希望と、ほかの集め方の希望のある日。 */
  workDates: string[];
  notes: Array<{ date: string; note: string }>;
};

export function shiftTypeOption(pattern: ShiftSubmissionPattern, id: string): Slot {
  if (pattern.kind !== "shiftType") throw new Error("Shift type option requires a shift type pattern");
  const option = pattern.options.find((candidate) => candidate.id === id);
  if (!option) throw new Error(`Unknown shift type option: ${id}`);
  return { startTime: option.startTime, endTime: option.endTime, optionId: option.id };
}

/** 出勤する日のメモと、そのメモに合う希望。日付選択は時刻を持たないため、出勤日だけを決める。 */
export function workNotesFor(random: Random, pattern: ShiftSubmissionPattern): Record<string, () => Slot[]> {
  if (pattern.kind === "time") {
    return {
      閉店作業まで入れます: () => [{ startTime: pick(random, ["16:00", "17:00", "18:00"]), endTime: pattern.endTime }],
      午後からなら入れます: () => [
        { startTime: pick(random, ["13:00", "14:00"]), endTime: pick(random, ["19:00", "20:00", "22:00"]) },
      ],
      早番で入りたいです: () => [{ startTime: "06:00", endTime: pick(random, ["11:00", "12:00"]) }],
      "17時以降なら入れます": () => [
        { startTime: pick(random, ["17:00", "18:00"]), endTime: pick(random, ["22:00", "23:00"]) },
      ],
      "18時までなら入れます": () => [{ startTime: pick(random, ["09:00", "10:00", "12:00"]), endTime: "18:00" }],
      短めでお願いします: () => [
        pick(random, [
          { startTime: "11:00", endTime: "14:00" },
          { startTime: "10:00", endTime: "14:00" },
          { startTime: "18:00", endTime: "21:00" },
          { startTime: "17:00", endTime: "21:00" },
        ]),
      ],
      昼休憩を長めにほしいです: () => [
        pick(random, [
          { startTime: "09:00", endTime: "19:00" },
          { startTime: "10:00", endTime: "20:00" },
        ]),
      ],
    };
  }
  if (pattern.kind === "shiftType") {
    return {
      閉店作業まで入れます: () => [shiftTypeOption(pattern, "night")],
      午後からなら入れます: () => [shiftTypeOption(pattern, "late")],
      早番で入りたいです: () => [shiftTypeOption(pattern, "early")],
      "17時以降なら入れます": () => [shiftTypeOption(pattern, "night")],
      "18時までなら入れます": () => [shiftTypeOption(pattern, "early")],
      通しで入れます: () => [shiftTypeOption(pattern, "early"), shiftTypeOption(pattern, "late")],
    };
  }
  return {
    閉店作業まで入れます: () => [],
    午後からなら入れます: () => [],
    早番で入りたいです: () => [],
    "17時以降なら入れます": () => [],
    短めでお願いします: () => [],
  };
}

/**
 * 1人分の希望を作る。メモを先に決め、その日の希望をメモに合わせる。
 * 休む日のメモの日には希望を入れず、1人の中で同じメモを繰り返さない。
 */
function buildPreferences(
  random: Random,
  pattern: ShiftSubmissionPattern,
  openDates: readonly string[],
  workRate: number,
): Preferences {
  const slotsByDate = new Map<string, Slot[]>();
  const workDates: string[] = [];
  const notes: Array<{ date: string; note: string }> = [];
  const workNotes = workNotesFor(random, pattern);

  const baseKind = pick(random, ["early", "day", "late", "night"]);
  const randomSlots = (): Slot[] => {
    if (pattern.kind === "time") {
      const kind = random() < 0.75 ? baseKind : pick(random, ["early", "day", "late", "night"]);
      return [pick(random, TIME_BASE_SLOTS[kind])];
    }
    if (pattern.kind === "shiftType") {
      const preferred = baseKind === "late" ? "late" : baseKind === "night" ? "night" : "early";
      const roll = random();
      if (roll < 0.12) return [shiftTypeOption(pattern, "early"), shiftTypeOption(pattern, "late")];
      if (roll < 0.75) return [shiftTypeOption(pattern, preferred)];
      return [shiftTypeOption(pattern, pick(random, ["early", "late", "night"]))];
    }
    return [];
  };

  const noteCount = random() < 0.3 ? 0 : randomInt(random, 1, 3);
  const usedNotes = new Set<string>();
  const notedDates = new Set<string>();
  for (const date of shuffle(random, openDates).slice(0, noteCount)) {
    const isOff = random() < 0.4;
    const candidates = (isOff ? USER_SEED_OFF_NOTES : Object.keys(workNotes)).filter((note) => !usedNotes.has(note));
    if (candidates.length === 0) continue;
    const note = pick(random, candidates);
    usedNotes.add(note);
    notedDates.add(date);
    notes.push({ date, note });
    if (isOff) continue;
    workDates.push(date);
    const slots = workNotes[note]();
    if (slots.length > 0) slotsByDate.set(date, slots);
  }

  for (const date of openDates) {
    if (notedDates.has(date) || random() >= workRate) continue;
    workDates.push(date);
    const slots = randomSlots();
    if (slots.length > 0) slotsByDate.set(date, slots);
  }

  workDates.sort();
  notes.sort((a, b) => a.date.localeCompare(b.date));
  return { slotsByDate, workDates, notes };
}

/** メモとその日の希望が食い違っていないかを数える。投入した結果の確かめに使う。 */
export function countNoteMismatches(pattern: ShiftSubmissionPattern, preferences: Preferences): number {
  let mismatches = 0;
  for (const { date, note } of preferences.notes) {
    const isOff = USER_SEED_OFF_NOTES.includes(note);
    const works = preferences.workDates.includes(date);
    if (isOff === works) {
      mismatches += 1;
      continue;
    }
    if (isOff || pattern.kind === "dateOnly") continue;
    const slots = preferences.slotsByDate.get(date) ?? [];
    const start = Math.min(...slots.map((slot) => toMinutes(slot.startTime)));
    const end = Math.max(...slots.map((slot) => toMinutes(slot.endTime)));
    const closingTime = pattern.kind === "time" ? toMinutes(pattern.endTime) : 24 * 60;
    const matches: Record<string, boolean> = {
      閉店作業まで入れます: end === closingTime,
      午後からなら入れます: start >= 13 * 60,
      早番で入りたいです: start <= 9 * 60,
      "17時以降なら入れます": start >= 17 * 60,
      "18時までなら入れます": end <= 18 * 60,
      短めでお願いします: end - start <= 4 * 60,
      昼休憩を長めにほしいです: start < 12 * 60 && end > 13 * 60 && end - start >= 9 * 60,
      通しで入れます: slots.length === 2,
      // 次の2つは、上限のデータだけが使う。
      開店から閉店まで入れます:
        pattern.kind === "time" && start === toMinutes(pattern.startTime) && end === closingTime,
      深夜の時間帯に入れます: start >= 21 * 60,
    };
    if (matches[note] === false) mismatches += 1;
  }
  return mismatches;
}

// ---------- 書き込み ----------

export type SeedShop = {
  definition: ShopDefinition;
  shopId: Id<"shops">;
  positions: Array<Doc<"positions">>;
  /** シフト対象のスタッフ。`isManager`は管理者本人だけがtrueで、ほかの管理者はスタッフと同じに扱う。 */
  staffs: Array<{ staffId: Id<"staffs">; name: string; isManager: boolean; skills: Map<Id<"positions">, string> }>;
  /** 店舗に所属するスタッフの数。管理者と、シフトの対象から外した人を含む。 */
  staffCount: number;
};

export type SeedStaffPerson = { personId: Id<"organizationPeople">; name: string; email: string };

export type SeedCoManager = SeedStaffPerson & { userId: Id<"users"> };

export type UserSeedRecruitmentSummary = {
  key: UserSeedRecruitmentKey;
  status: "open" | "confirmed";
  periodStart: string;
  periodEnd: string;
  submittedCount: number;
  preferenceCount: number;
  noteCount: number;
  assignmentCount: number;
};

export type UserSeedShopSummary = {
  name: string;
  staffCount: number;
  recruitments: UserSeedRecruitmentSummary[];
};

export type UserSeedResult = {
  organizationId: Id<"organizations">;
  organizationName: string;
  randomSeed: number;
  /** 有効な管理者の数。管理者本人を含む。 */
  managerCount: number;
  lineLinkedStaffCount: number;
  /** 送ったことにした通知の記録の数。 */
  emailNotificationCount: number;
  lineNotificationCount: number;
  shops: UserSeedShopSummary[];
  noteMismatchCount: number;
};

/**
 * 選んだ管理者ユーザーに、Trialの組織と3つの集め方の店舗を作り、確認に使うデータを入れる。
 * 1回のmutationで全件を書き、途中で失敗した場合は何も残さない。
 */
export async function seedUserOrganizationGraph(
  ctx: MutationCtx,
  args: { user: Doc<"users">; today: string; now: number; randomSeed: number },
): Promise<UserSeedResult> {
  const { user, today, now } = args;
  const random = createSeedRandom(args.randomSeed);

  const { organizationId, managerPersonId, managerMemberId } = await insertOrganization(ctx, {
    user,
    name: USER_SEED_ORGANIZATION_NAME,
    now,
  });
  const coManagers = await insertCoManagers(ctx, {
    organizationId,
    owner: user,
    inviterMemberId: managerMemberId,
    now,
  });
  const staffPeople = await insertStaffPeople(ctx, {
    organizationId,
    people: USER_SEED_STAFF_NAMES.map((name, index) => ({ name, email: userSeedStaffEmail(index) })),
    now,
  });

  const shops: UserSeedShopSummary[] = [];
  const shopIds: Id<"shops">[] = [];
  let noteMismatchCount = 0;
  for (const definition of USER_SEED_SHOPS) {
    const result = await insertStandardShop(ctx, {
      definition,
      organizationId,
      user,
      managerPersonId,
      staffPeople,
      coManagers,
      shiftExclusion: {
        staffCount: USER_SEED_EXCLUDED_STAFF_COUNT,
        managers: USER_SEED_EXCLUDED_MANAGERS[definition.key],
      },
      today,
      now,
      random,
    });
    shops.push(result.summary);
    shopIds.push(result.shopId);
    noteMismatchCount += result.noteMismatchCount;
  }
  // 店舗ごとのスタッフの行へも連携を書くため、店舗を作り終えてから入れる。
  const lineLinkedStaffCount = await insertLineLinks(ctx, { organizationId, staffPeople, now, random });
  // 通知の記録は、入れ終えた募集とLINE連携を読んで作る。
  const notificationCounts = await insertNotificationRecords(ctx, {
    organizationId,
    shopIds,
    ownerUserId: user._id,
    now,
  });

  return {
    organizationId,
    organizationName: USER_SEED_ORGANIZATION_NAME,
    randomSeed: args.randomSeed,
    managerCount: coManagers.length + 1,
    lineLinkedStaffCount,
    emailNotificationCount: notificationCounts.email,
    lineNotificationCount: notificationCounts.line,
    shops,
    noteMismatchCount,
  };
}

export const userSeedStaffEmail = (index: number) =>
  `devstaff${String(index + 1).padStart(2, "0")}@${USER_SEED_STAFF_EMAIL_DOMAIN}`;

/** Trialの組織と、管理者本人の所属を作る。 */
export async function insertOrganization(ctx: MutationCtx, args: { user: Doc<"users">; name: string; now: number }) {
  const { user, name, now } = args;
  const organizationId = await ctx.db.insert("organizations", {
    createdByUserId: user._id,
    name,
    billingEmail: user.email,
    billingEmailNormalized: user.emailNormalized,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });
  const managerPersonId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId: user._id,
    name: user.name,
    email: user.email,
    emailNormalized: user.emailNormalized,
    status: "active",
    lineLinkGeneration: 0,
    createdAt: now,
    updatedAt: now,
  });
  const managerMemberId = await ctx.db.insert("organizationMembers", {
    organizationId,
    personId: managerPersonId,
    userId: user._id,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  // Trialの期限の切替（processDeadline）は予約しない。確認用の組織はTrialのまま使う。
  await ctx.db.insert("organizationBillingStates", {
    organizationId,
    state: { kind: "trial", trialEndsAt: calculateTrialEndsAt(now) },
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId,
    actorUserId: user._id,
    actorPersonId: managerPersonId,
    action: "organization.created",
    targetKind: "organization",
    targetId: organizationId,
    toState: "trial",
    occurredAt: now,
  });
  return { organizationId, managerPersonId, managerMemberId };
}

export async function insertStaffPeople(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; people: ReadonlyArray<{ name: string; email: string }>; now: number },
): Promise<SeedStaffPerson[]> {
  const staffPeople: SeedStaffPerson[] = [];
  for (const { name, email } of args.people) {
    const personId = await ctx.db.insert("organizationPeople", {
      organizationId: args.organizationId,
      name,
      email,
      emailNormalized: email,
      status: "active",
      lineLinkGeneration: 0,
      createdAt: args.now,
      updatedAt: args.now,
    });
    staffPeople.push({ personId, name, email });
  }
  return staffPeople;
}

/**
 * 管理者本人のほかの管理者を入れる。ユーザーの行は入れ先のユーザーごとに決まった識別子で作り、入れ直しても増やさない。
 * この識別子はClerkのissuerと合わないため、ログインには使えない。
 */
async function insertCoManagers(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    owner: Doc<"users">;
    inviterMemberId: Id<"organizationMembers">;
    now: number;
  },
): Promise<SeedCoManager[]> {
  const { organizationId, owner, now } = args;
  const coManagers: SeedCoManager[] = [];
  for (const [index, { name, email }] of USER_SEED_CO_MANAGERS.entries()) {
    const authTokenIdentifier = userSeedCoManagerAuthTokenIdentifier(owner._id, index);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", authTokenIdentifier))
      .unique();
    if (existing && (existing.isDeleted || existing.accountDeletionRequestedAt !== undefined)) {
      throw new Error("User seed co-manager user is deleted");
    }
    const userId =
      existing?._id ??
      (await ctx.db.insert("users", {
        authTokenIdentifier,
        name,
        email,
        emailNormalized: email,
        role: "manager",
        isDeleted: false,
      }));
    const personId = await ctx.db.insert("organizationPeople", {
      organizationId,
      userId,
      name,
      email,
      emailNormalized: email,
      status: "active",
      lineLinkGeneration: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMembers", {
      organizationId,
      personId,
      userId,
      status: "active",
      invitedByMemberId: args.inviterMemberId,
      createdAt: now,
      updatedAt: now,
    });
    coManagers.push({ personId, userId, name, email });
  }
  return coManagers;
}

/**
 * スタッフの一部をLINE連携済みにする。本来の連携と同じ3種類の行（LINEの利用者、人物との連携、店舗ごとのスタッフの連携）を書く。
 * LINEの利用者のIDは、LINEが発行する形と違う値にする。この値を宛先にした送信は、だれにも届かない。
 * 入れ直す前の組織の連携が後片付けを待っている間も重ならないよう、IDは毎回別の値にする。
 */
async function insertLineLinks(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; staffPeople: SeedStaffPerson[]; now: number; random: Random },
): Promise<number> {
  const { organizationId, now, random } = args;
  const linkedPeople = shuffle(random, args.staffPeople).slice(0, USER_SEED_LINE_LINKED_STAFF_COUNT);
  for (const person of linkedPeople) {
    // 連携した日を人ごとにずらし、通知がメールからLINEへ切り替わる時期を変える。スタッフの登録（30日前）よりあとにする。
    const linkedAt = now - randomInt(random, 3, 25) * DAY_MS;
    const lineUserId = `U_USER_SEED_${generateUUID()}`;
    const { provider } = await upsertLineProviderUser(ctx, {
      lineUserId,
      following: true,
      observedAt: linkedAt,
      source: "oauth",
    });
    await upsertOrganizationPersonLineLink(ctx, {
      organizationId,
      organizationPersonId: person.personId,
      lineProviderUserId: provider._id,
      linkedAt,
    });
    const staffs = await listActiveStaffsForOrganizationPerson(ctx, {
      organizationId,
      organizationPersonId: person.personId,
    });
    for (const staff of staffs) {
      await upsertStaffLineAccount(ctx, { staffId: staff._id, shopId: staff.shopId, lineUserId, following: true });
    }
  }
  return linkedPeople.length;
}

/** `/seed`の1店舗ぶん。店舗、必要人数、4つの状態の募集を入れる。 */
export async function insertStandardShop(
  ctx: MutationCtx,
  args: {
    definition: ShopDefinition;
    organizationId: Id<"organizations">;
    user: Doc<"users">;
    managerPersonId: Id<"organizationPeople">;
    staffPeople: SeedStaffPerson[];
    coManagers?: SeedCoManager[];
    shiftExclusion?: ShiftExclusion;
    today: string;
    now: number;
    random: Random;
  },
): Promise<{ shopId: Id<"shops">; summary: UserSeedShopSummary; noteMismatchCount: number }> {
  const { definition, today, now, random } = args;
  const shop = await insertShop(ctx, args);
  const templates = await insertTemplates(ctx, shop, random);
  const recruitments: UserSeedRecruitmentSummary[] = [];
  let noteMismatchCount = 0;
  for (const window of buildUserSeedRecruitmentWindows(today)) {
    const result = await insertRecruitment(ctx, { shop, window, templates, now, random });
    recruitments.push(result.summary);
    noteMismatchCount += result.noteMismatchCount;
  }
  if (definition.key === "dateOnly") {
    const email = `devstaff-request@${USER_SEED_STAFF_EMAIL_DOMAIN}`;
    await insertRegistrationRequest(ctx, { shopId: shop.shopId, name: "佐々木 由佳", email, now });
  }
  return {
    shopId: shop.shopId,
    summary: { name: definition.name, staffCount: shop.staffCount, recruitments },
    noteMismatchCount,
  };
}

export async function insertShop(
  ctx: MutationCtx,
  args: {
    definition: ShopDefinition;
    organizationId: Id<"organizations">;
    user: Doc<"users">;
    managerPersonId: Id<"organizationPeople">;
    staffPeople: SeedStaffPerson[];
    /** 管理者本人のほかの管理者。省くと入れない。 */
    coManagers?: SeedCoManager[];
    /** シフトの対象から外す人。省くと、スタッフを1人だけ外す。 */
    shiftExclusion?: ShiftExclusion;
    random: Random;
  },
): Promise<SeedShop> {
  const { definition, organizationId, random } = args;
  const coManagers = args.coManagers ?? [];
  const exclusion = args.shiftExclusion ?? { staffCount: 1, managers: [] };
  const excludedManagers = new Set(exclusion.managers);
  const shopId = await ctx.db.insert("shops", {
    organizationId,
    name: definition.name,
    regularClosedDays: definition.regularClosedDays,
    submissionPattern: definition.pattern,
    breakRule: definition.breakRule,
    isDeleted: false,
  });
  const positions: Array<Doc<"positions">> = [];
  for (const [sortOrder, position] of definition.positions.entries()) {
    const positionId = await ctx.db.insert("positions", {
      shopId,
      name: position.name,
      color: position.color,
      sortOrder,
      isDefault: sortOrder === 0,
      isDeleted: false,
    });
    const inserted = await ctx.db.get(positionId);
    if (!inserted) throw new Error("Seeded position was not found");
    positions.push(inserted);
  }

  const managerStaffId = await ctx.db.insert("staffs", {
    shopId,
    organizationId,
    organizationPersonId: args.managerPersonId,
    name: args.user.name,
    email: args.user.email,
    emailNormalized: args.user.emailNormalized,
    userId: args.user._id,
    excludedFromShift: excludedManagers.has("self"),
    isDeleted: false,
  });
  await recordStaffLegalConsent(ctx, { staffId: managerStaffId, shopId, method: "manager_setup" });

  const staffs: SeedShop["staffs"] = [];
  if (!excludedManagers.has("self")) {
    staffs.push({ staffId: managerStaffId, name: args.user.name, isManager: true, skills: new Map() });
  }
  // ほかの管理者は、シフトに入るスタッフと同じに扱う。希望を出し、割り当ても受ける。
  for (const [index, coManager] of coManagers.entries()) {
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      organizationId,
      organizationPersonId: coManager.personId,
      name: coManager.name,
      email: coManager.email,
      emailNormalized: coManager.email,
      userId: coManager.userId,
      excludedFromShift: excludedManagers.has(index),
      isDeleted: false,
    });
    await recordStaffLegalConsent(ctx, { staffId, shopId, method: "manager_setup" });
    if (excludedManagers.has(index)) continue;
    staffs.push({ staffId, name: coManager.name, isManager: false, skills: new Map() });
  }

  const excludedStaffCount = definition.keepsAllStaffInShift ? 0 : exclusion.staffCount;
  const excludedIndexes = new Set(
    excludedStaffCount > 0
      ? shuffle(
          random,
          args.staffPeople.map((_, index) => index),
        ).slice(0, excludedStaffCount)
      : [],
  );
  for (const [index, person] of args.staffPeople.entries()) {
    const positionSkills: Array<{ positionId: Id<"positions">; level: "unavailable" | "newcomer" }> = [];
    if (random() < 0.15) positionSkills.push({ positionId: positions[0]._id, level: "newcomer" });
    for (const position of positions.slice(1)) {
      const roll = random();
      if (roll < 0.35) positionSkills.push({ positionId: position._id, level: "unavailable" });
      else if (roll < 0.5) positionSkills.push({ positionId: position._id, level: "newcomer" });
    }
    const isExcluded = excludedIndexes.has(index);
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      organizationId,
      organizationPersonId: person.personId,
      name: person.name,
      email: person.email,
      emailNormalized: person.email,
      excludedFromShift: isExcluded,
      ...(positionSkills.length > 0 ? { positionSkills } : {}),
      isDeleted: false,
    });
    if (isExcluded) continue;
    staffs.push({
      staffId,
      name: person.name,
      isManager: false,
      skills: new Map(positionSkills.map((skill) => [skill.positionId, skill.level])),
    });
  }
  return { definition, shopId, positions, staffs, staffCount: args.staffPeople.length + coManagers.length + 1 };
}

export type TemplateIds = { weekday: Id<"shiftDayTemplates">; weekend: Id<"shiftDayTemplates"> };

async function insertTemplates(ctx: MutationCtx, shop: SeedShop, random: Random): Promise<TemplateIds> {
  const { shopId, definition } = shop;
  const [first, second, third] = shop.positions.map((position) => position._id);

  if (definition.pattern.kind === "time") {
    const bars = (windows: Array<[Id<"positions">, string, string, number, number]>) =>
      windows.flatMap(([positionId, startTime, endTime, min, max]) =>
        Array.from({ length: randomInt(random, min, max) }, () => ({ positionId, startTime, endTime })),
      );
    const weekendBars = () =>
      bars([
        [first, "06:00", "12:00", 2, 2],
        [first, "10:00", "16:00", 2, 3],
        [first, "11:00", "15:00", 1, 1],
        [first, "16:00", "22:00", 2, 3],
        [first, "18:00", "24:00", 1, 2],
        [second, "06:00", "12:00", 1, 1],
        [second, "10:00", "16:00", 1, 2],
        [second, "17:00", "23:00", 2, 2],
      ]);
    const weekday = await ctx.db.insert("shiftDayTemplates", {
      shopId,
      name: "平日",
      sortOrder: 0,
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      appliesToHolidays: false,
      requirements: {
        kind: "time",
        bars: bars([
          [first, "06:00", "12:00", 1, 2],
          [first, "10:00", "15:00", 1, 2],
          [first, "11:00", "14:00", 1, 1],
          [first, "17:00", "22:00", 1, 2],
          [first, "18:00", "24:00", 1, 1],
          [second, "06:00", "12:00", 1, 1],
          [second, "11:00", "15:00", 1, 2],
          [second, "17:00", "23:00", 1, 2],
        ]),
      },
    });
    const weekend = await ctx.db.insert("shiftDayTemplates", {
      shopId,
      name: "土日",
      sortOrder: 1,
      weekdays: ["sat", "sun"],
      appliesToHolidays: false,
      requirements: { kind: "time", bars: weekendBars() },
    });
    await ctx.db.insert("shiftDayTemplates", {
      shopId,
      name: "祝日",
      sortOrder: 2,
      weekdays: [],
      appliesToHolidays: true,
      requirements: { kind: "time", bars: weekendBars() },
    });
    return { weekday, weekend };
  }

  if (definition.pattern.kind === "dateOnly") {
    const weekday = await ctx.db.insert("shiftDayTemplates", {
      shopId,
      name: "平日",
      sortOrder: 0,
      weekdays: ["mon", "tue", "wed", "fri"],
      appliesToHolidays: false,
      requirements: {
        kind: "dateOnly",
        counts: [
          { positionId: first, count: randomInt(random, 2, 4) },
          { positionId: second, count: randomInt(random, 1, 3) },
        ],
      },
    });
    const weekend = await ctx.db.insert("shiftDayTemplates", {
      shopId,
      name: "土日・祝日",
      sortOrder: 1,
      weekdays: ["sat", "sun"],
      appliesToHolidays: true,
      requirements: {
        kind: "dateOnly",
        counts: [
          { positionId: first, count: randomInt(random, 3, 5) },
          { positionId: second, count: randomInt(random, 2, 3) },
        ],
      },
    });
    return { weekday, weekend };
  }

  const counts = (hall: [number, number], kitchen: [number, number], drink: [number, number]) =>
    [
      { positionId: first, count: randomInt(random, ...hall) },
      { positionId: second, count: randomInt(random, ...kitchen) },
      { positionId: third, count: randomInt(random, ...drink) },
    ].filter((entry) => entry.count > 0);
  const weekday = await ctx.db.insert("shiftDayTemplates", {
    shopId,
    name: "平日",
    sortOrder: 0,
    weekdays: ["wed", "thu", "fri"],
    appliesToHolidays: false,
    requirements: {
      kind: "shiftType",
      options: [
        { optionId: "early", counts: counts([1, 2], [1, 1], [0, 1]) },
        { optionId: "late", counts: counts([2, 3], [1, 2], [1, 1]) },
        { optionId: "night", counts: counts([1, 2], [1, 1], [0, 1]) },
      ],
    },
  });
  const weekend = await ctx.db.insert("shiftDayTemplates", {
    shopId,
    name: "土曜",
    sortOrder: 1,
    weekdays: ["sat"],
    appliesToHolidays: false,
    requirements: {
      kind: "shiftType",
      options: [
        { optionId: "early", counts: counts([2, 3], [1, 2], [1, 1]) },
        { optionId: "late", counts: counts([3, 4], [2, 2], [1, 2]) },
        { optionId: "night", counts: counts([2, 3], [1, 2], [1, 1]) },
      ],
    },
  });
  await ctx.db.insert("shiftDayTemplates", {
    shopId,
    name: "日曜・祝日",
    sortOrder: 2,
    weekdays: ["sun"],
    appliesToHolidays: true,
    requirements: {
      kind: "shiftType",
      options: [
        { optionId: "early", counts: counts([2, 2], [1, 1], [0, 1]) },
        { optionId: "late", counts: counts([2, 3], [1, 2], [1, 1]) },
        { optionId: "night", counts: counts([1, 2], [1, 1], [0, 1]) },
      ],
    },
  });
  return { weekday, weekend };
}

export type AssignmentCore = {
  date: string;
  startTime: string;
  endTime: string;
  positionId: Id<"positions">;
  optionId?: string;
  breaks?: Array<{ startTime: string; endTime: string }>;
};

/** 担当外でないポジションから選ぶ。既定のポジションを選びやすくする。 */
function choosePosition(random: Random, shop: SeedShop, skills: Map<Id<"positions">, string>) {
  const candidates = shop.positions.filter((position) => skills.get(position._id) !== "unavailable");
  if (candidates.length === 0) return null;
  const weighted = candidates.flatMap((position) => (position.isDefault ? [position, position] : [position]));
  return pick(random, weighted)._id;
}

/** 時間指定で休憩の決まりに当たる勤務へ、勤務の中ほどに休憩を入れる。 */
export function breaksFor(shop: SeedShop, slot: Slot): AssignmentCore["breaks"] {
  if (shop.definition.pattern.kind !== "time") return undefined;
  const start = toMinutes(slot.startTime);
  const end = toMinutes(slot.endTime);
  const { minWorkMinutes, breakMinutes } = shop.definition.breakRule;
  if (end - start < minWorkMinutes) return undefined;
  const breakStart = start + Math.floor((end - start - breakMinutes) / 2 / 30) * 30;
  return [{ startTime: toTime(breakStart), endTime: toTime(breakStart + breakMinutes) }];
}

/** 希望、メモ、割り当ての作り方。 */
export type RecruitmentProfile = {
  preferencesFor: (random: Random, shop: SeedShop, openDates: readonly string[], staffIndex: number) => Preferences;
  /** 希望のうち、割り当てる割合。 */
  assignmentRate: number;
  /** 保存するメモの文。 */
  noteText: (note: string) => string;
  breaksFor: (shop: SeedShop, slot: Slot) => AssignmentCore["breaks"];
};

const STANDARD_RECRUITMENT_PROFILE: RecruitmentProfile = {
  preferencesFor: (random, shop, openDates) =>
    buildPreferences(random, shop.definition.pattern, openDates, shop.definition.workRate),
  // 希望の4分の3ほどを、希望どおりの時間で割り当てる。
  assignmentRate: 0.75,
  noteText: (note) => note,
  breaksFor,
};

export async function insertRecruitment(
  ctx: MutationCtx,
  args: {
    shop: SeedShop;
    window: RecruitmentWindow;
    templates: TemplateIds;
    now: number;
    random: Random;
    profile?: RecruitmentProfile;
  },
): Promise<{ summary: UserSeedRecruitmentSummary; noteMismatchCount: number }> {
  const { shop, window, templates, now, random } = args;
  const profile = args.profile ?? STANDARD_RECRUITMENT_PROFILE;
  const { pattern, regularClosedDays } = shop.definition;
  const confirmedAt = now - (window.confirmedDaysAgo ?? 0) * 24 * 60 * 60 * 1000;
  const dates = generateDateRange(window.periodStart, window.periodEnd);
  const closedDates = dates.filter((date) => regularClosedDays.includes(weekdayOf(date)));
  const openDates = dates.filter((date) => !closedDates.includes(date));
  const isConfirmed = window.status === "confirmed";
  const hasAssignments = window.key !== "recruiting";

  const recruitmentId = await ctx.db.insert("recruitments", {
    shopId: shop.shopId,
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    deadline: window.deadline,
    shopClosedDates: closedDates,
    status: window.status,
    isDeleted: false,
    submissionPattern: pattern,
    ...(isConfirmed ? { confirmedAt } : {}),
    ...(hasAssignments ? { draftSavedAt: now - 3 * 60 * 60 * 1000 } : {}),
    ...(isConfirmed
      ? {
          confirmedPositions: shop.positions.map((position) => ({
            positionId: position._id,
            name: position.name,
            color: position.color,
            isDefault: position.isDefault,
          })),
        }
      : {}),
  });

  // 募集中の期間に1日だけ、曜日と違うテンプレートを当てる。
  if (window.key === "recruiting") {
    const overrideDate = openDates.find((date) => weekdayOf(date) === "fri");
    if (overrideDate) {
      await ctx.db.insert("shiftDayTemplateOverrides", {
        shopId: shop.shopId,
        date: overrideDate,
        kind: "template",
        templateId: templates.weekend,
      });
    }
  }

  // 管理者本人は提出しない。ほかに提出しない人を決める。
  const others = shop.staffs.filter((staff) => !staff.isManager);
  const unsubmittedCount = window.unsubmittedCount === "random" ? randomInt(random, 4, 8) : window.unsubmittedCount;
  const unsubmitted = new Set(
    shuffle(random, others)
      .slice(0, unsubmittedCount)
      .map((staff) => staff.staffId),
  );

  let submittedCount = 0;
  let preferenceCount = 0;
  let noteCount = 0;
  let assignmentCount = 0;
  let noteMismatchCount = 0;
  const assignmentsByStaff = new Map<Id<"staffs">, AssignmentCore[]>();
  for (const [staffIndex, staff] of others.entries()) {
    if (unsubmitted.has(staff.staffId)) continue;
    const submittedAt = now - randomInt(random, 1, 72) * 60 * 60 * 1000;
    const submissionId = await ctx.db.insert("shiftSubmissions", {
      recruitmentId,
      staffId: staff.staffId,
      firstSubmittedAt: submittedAt - randomInt(random, 0, 24) * 60 * 60 * 1000,
      submittedAt,
    });
    submittedCount += 1;
    const preferences = profile.preferencesFor(random, shop, openDates, staffIndex);
    noteMismatchCount += countNoteMismatches(pattern, preferences);

    if (pattern.kind === "dateOnly") {
      for (const date of preferences.workDates) {
        await ctx.db.insert("shiftSubmissionDates", { submissionId, recruitmentId, staffId: staff.staffId, date });
        preferenceCount += 1;
      }
    } else {
      for (const [date, slots] of preferences.slotsByDate) {
        for (const slot of slots) {
          await ctx.db.insert("shiftSubmissionSlots", {
            submissionId,
            recruitmentId,
            staffId: staff.staffId,
            date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            ...(slot.optionId ? { optionId: slot.optionId } : {}),
          });
          preferenceCount += 1;
        }
      }
    }
    for (const { date, note } of preferences.notes) {
      await ctx.db.insert("shiftSubmissionDateNotes", {
        submissionId,
        recruitmentId,
        staffId: staff.staffId,
        date,
        note: profile.noteText(note),
      });
      noteCount += 1;
    }

    if (!hasAssignments) continue;
    const assignments: AssignmentCore[] = [];
    for (const date of preferences.workDates) {
      if (random() >= profile.assignmentRate) continue;
      const positionId = choosePosition(random, shop, staff.skills);
      if (!positionId) continue;
      const slots =
        pattern.kind === "dateOnly" ? [DATE_ONLY_ASSIGNMENT_TIME] : (preferences.slotsByDate.get(date) ?? []);
      for (const slot of slots) {
        const breaks = profile.breaksFor(shop, slot);
        assignments.push({
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          positionId,
          ...(slot.optionId ? { optionId: slot.optionId } : {}),
          ...(breaks ? { breaks } : {}),
        });
      }
    }
    for (const assignment of assignments) {
      await ctx.db.insert("shiftAssignments", { recruitmentId, staffId: staff.staffId, ...assignment });
      assignmentCount += 1;
    }
    if (assignments.length > 0) assignmentsByStaff.set(staff.staffId, assignments);
  }

  await ctx.db.insert("recruitmentStats", {
    recruitmentId,
    shopId: shop.shopId,
    submittedCount,
    activeStaffCountSnapshot: shop.staffs.length,
    updatedAt: now,
  });

  if (isConfirmed) {
    await insertConfirmationRecords(ctx, {
      shop,
      recruitmentId,
      window,
      assignmentsByStaff,
      sentAt: confirmedAt,
      random,
    });
  }

  return {
    summary: {
      key: window.key,
      status: window.status,
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      submittedCount,
      preferenceCount,
      noteCount,
      assignmentCount,
    },
    noteMismatchCount,
  };
}

/**
 * 確定済みの募集に、確定時の必要人数と、スタッフごとの確定通知の記録を入れる。
 * 「確定後に変更あり」では、2人の通知の記録から勤務を1つ外し、通知のあとで勤務を足した状態にする。
 */
async function insertConfirmationRecords(
  ctx: MutationCtx,
  args: {
    shop: SeedShop;
    recruitmentId: Id<"recruitments">;
    window: RecruitmentWindow;
    assignmentsByStaff: Map<Id<"staffs">, AssignmentCore[]>;
    sentAt: number;
    random: Random;
  },
) {
  const { shop, recruitmentId, window, sentAt } = args;
  const templates = await ctx.db
    .query("shiftDayTemplates")
    .withIndex("by_shopId", (q) => q.eq("shopId", shop.shopId))
    .take(20);
  const staffingDays = await resolveRecruitmentStaffingDays(ctx, {
    shopId: shop.shopId,
    recruitment: { ...window, submissionPattern: shop.definition.pattern },
    templates,
    activePositionIds: new Set(shop.positions.map((position) => position._id)),
  });
  for (const day of staffingDays) {
    if (day.requirements === null && day.templateName === null) continue;
    await ctx.db.insert("recruitmentStaffingSnapshots", {
      recruitmentId,
      shopId: shop.shopId,
      date: day.date,
      templateName: day.templateName,
      requirements: day.requirements,
    });
  }

  const changedStaffIds = new Set(
    window.key === "confirmedChanged"
      ? shuffle(
          args.random,
          [...args.assignmentsByStaff.entries()].filter(([, assignments]) => assignments.length >= 2),
        )
          .slice(0, 2)
          .map(([staffId]) => staffId)
      : [],
  );
  for (const [staffId, assignments] of args.assignmentsByStaff) {
    const snapshotAssignments = changedStaffIds.has(staffId) ? assignments.slice(1) : assignments;
    await ctx.db.insert("shiftConfirmationSnapshots", {
      recruitmentId,
      staffId,
      signature: buildConfirmationSnapshotSignature(snapshotAssignments),
      assignments: snapshotAssignments,
      sentAt,
      updatedAt: sentAt,
    });
  }
}

export async function insertRegistrationRequest(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; name: string; email: string; now: number },
) {
  const { shopId, name, email, now } = args;
  await ctx.db.insert("staffRegistrationRequests", {
    shopId,
    name,
    email,
    emailNormalized: email,
    status: "pending",
    ...getLegalConsentVersions("staff"),
    consentedAt: now - 60 * 60 * 1000,
    emailVerifiedAt: now - 60 * 60 * 1000,
    createdAt: now - 60 * 60 * 1000,
  });
}
