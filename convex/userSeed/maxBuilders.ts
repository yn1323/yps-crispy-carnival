import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { addDays } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { MAX_SHIFT_TYPE_OPTIONS } from "../_lib/submissionPatternConstants";
import { MAX_SHIFT_TIME_MINUTES } from "../_lib/time";
import { generateUUID } from "../_lib/uuid";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_SELF_CREATED_LIMIT,
  PERSON_NAME_MAX_LENGTH,
  POSITION_ACTIVE_LIMIT,
  POSITION_COLOR_PALETTE,
  POSITION_NAME_MAX_LENGTH,
  RECRUITMENT_PERIOD_DAYS_MAX,
  SHIFT_ASSIGNMENT_BREAK_LIMIT,
  SHIFT_BOARD_STAFF_LIMIT,
  SHIFT_DATE_NOTE_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
  SHIFT_TYPE_NAME_MAX_LENGTH,
  SHOP_NAME_MAX_LENGTH,
  STAFF_REGISTRATION_PENDING_LIMIT,
} from "../constants";
import { ORGANIZATION_PLAN_LIMITS } from "../organizationBilling/planLimits";
import { getOrganizationInvitationExpiresAt } from "../organizationInvitation/constants";
import { getOrganizationCreationAvailability } from "../setup/service";
import {
  type AssignmentCore,
  breaksFor,
  createSeedRandom,
  insertOrganization,
  insertRecruitment,
  insertRegistrationRequest,
  insertShop,
  insertStaffPeople,
  insertStandardShop,
  type Preferences,
  pick,
  type Random,
  type RecruitmentProfile,
  type RecruitmentWindow,
  type SeedShop,
  type ShopDefinition,
  type Slot,
  shiftTypeOption,
  shuffle,
  type TemplateIds,
  toMinutes,
  toTime,
  USER_SEED_OFF_NOTES,
  USER_SEED_SHOPS,
  USER_SEED_STAFF_EMAIL_DOMAIN,
  USER_SEED_STAFF_NAMES,
  type UserSeedRecruitmentKey,
  type UserSeedRecruitmentSummary,
  userSeedStaffEmail,
  workNotesFor,
} from "./builders";

// 上限の確認用データの中身。画面で登録できる上限の数と長さで作る。
// 1つ目の組織を上限いっぱいにし、残りの組織は`/seed`の1店舗ぶんにする。

/** 上限いっぱいの組織と同じ上限を持つプラン。確認用の組織はTrialで作る。 */
const MAX_PLAN_LIMITS = ORGANIZATION_PLAN_LIMITS.trial;

const NAME_FILLER = "上限の文字数で表示を確かめるための長い名前です";
const NOTE_FILLER = "この文は、メモの文字数の上限で表示を確かめるために足しています。";

/** 名前を、ちょうど上限の文字数にする。 */
export function fillName(base: string, length: number): string {
  const innerLength = length - base.length - 2;
  if (innerLength < 1) throw new Error(`Seed name is too long to fill: ${base}`);
  return `${base}（${NAME_FILLER.repeat(Math.ceil(innerLength / NAME_FILLER.length)).slice(0, innerLength)}）`;
}

/** メモを、ちょうど上限の文字数にする。先頭の文は、その日の希望と合う元のメモのまま残す。 */
export function fillNote(note: string): string {
  const filler = NOTE_FILLER.repeat(Math.ceil(SHIFT_DATE_NOTE_MAX_LENGTH / NOTE_FILLER.length));
  return `${note}。${filler}`.slice(0, SHIFT_DATE_NOTE_MAX_LENGTH);
}

export const USER_SEED_MAX_ORGANIZATION_NAME = fillName("シフトリ上限確認用グループ", ORGANIZATION_NAME_MAX_LENGTH);

const lightOrganizationName = (order: number) => `シフトリ確認用グループ（${order}つ目）`;

// ---------- 人 ----------

const SURNAMES = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤"];
const GIVEN_NAMES = ["健太", "美咲", "翔", "結衣", "大輔", "彩花", "拓海"];

const personName = (index: number) =>
  fillName(
    `${SURNAMES[index % SURNAMES.length]} ${GIVEN_NAMES[Math.floor(index / SURNAMES.length) % GIVEN_NAMES.length]}`,
    PERSON_NAME_MAX_LENGTH,
  );

/** メールアドレスの@より前を、使える長さの上限（64文字）にする。 */
const longEmail = (prefix: string, index: number) =>
  `${`${prefix}${String(index + 1).padStart(2, "0")}-${"longaddressfordisplaycheck".repeat(3)}`.slice(0, 64)}@${USER_SEED_STAFF_EMAIL_DOMAIN}`;

/** 管理者本人を除いた、組織に入れるスタッフの数。 */
export const USER_SEED_MAX_STAFF_COUNT = MAX_PLAN_LIMITS.maxPeople - 1;
/** 招待中にする管理者の数。本人と合わせて管理者の上限になる。 */
export const USER_SEED_MAX_INVITATION_COUNT = MAX_PLAN_LIMITS.maxActiveManagers - 1;
/** 残りの組織に入れるスタッフの数。 */
const LIGHT_STAFF_COUNT = 10;

// ---------- 店舗の定義 ----------

const MAX_POSITIONS = [
  "ホール",
  "キッチン",
  "ドリンク",
  "レジ",
  "洗い場",
  "仕込み",
  "デリバリー",
  "清掃",
  "受付",
  "案内",
]
  .slice(0, POSITION_ACTIVE_LIMIT)
  .map((name, index) => ({
    name: fillName(name, POSITION_NAME_MAX_LENGTH),
    color: POSITION_COLOR_PALETTE[index % POSITION_COLOR_PALETTE.length],
  }));

const MAX_SHIFT_TYPE_PATTERN: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00" },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00" },
    { id: "night", name: "夜番", startTime: "18:00", endTime: "24:00" },
    { id: "midnight", name: "深夜番", startTime: "21:00", endTime: "30:00" },
  ]
    .slice(0, MAX_SHIFT_TYPE_OPTIONS)
    .map((option, sortOrder) => ({ ...option, name: fillName(option.name, SHIFT_TYPE_NAME_MAX_LENGTH), sortOrder })),
};

const maxShop = (
  definition: Pick<
    ShopDefinition,
    "key" | "name" | "pattern" | "regularClosedDays" | "breakRule" | "keepsAllStaffInShift"
  >,
): ShopDefinition => ({
  ...definition,
  name: fillName(definition.name, SHOP_NAME_MAX_LENGTH),
  positions: MAX_POSITIONS,
  workRate: 1,
});

/** 上限いっぱいの組織の店舗。前の3つは定休日がなく全員がシフトの対象で、後ろの2つは定休日と対象外の人を持つ。 */
export const USER_SEED_MAX_SHOPS: readonly ShopDefinition[] = [
  maxShop({
    key: "time",
    name: "時間指定",
    // 画面で選べるいちばん長い受付時間。
    pattern: { kind: "time", startTime: "00:00", endTime: toTime(MAX_SHIFT_TIME_MINUTES) },
    regularClosedDays: [],
    breakRule: { minWorkMinutes: 360, breakMinutes: 60 },
    keepsAllStaffInShift: true,
  }),
  maxShop({
    key: "dateOnly",
    name: "日付選択",
    pattern: { kind: "dateOnly" },
    regularClosedDays: [],
    breakRule: { minWorkMinutes: 480, breakMinutes: 60 },
    keepsAllStaffInShift: true,
  }),
  maxShop({
    key: "shiftType",
    name: "パターン選択",
    pattern: MAX_SHIFT_TYPE_PATTERN,
    regularClosedDays: [],
    breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
    keepsAllStaffInShift: true,
  }),
  maxShop({
    key: "time",
    name: "時間指定（定休日あり）",
    pattern: { kind: "time", startTime: "06:00", endTime: "24:00" },
    regularClosedDays: ["wed"],
    breakRule: { minWorkMinutes: 360, breakMinutes: 60 },
  }),
  maxShop({
    key: "shiftType",
    name: "パターン選択（定休日あり）",
    pattern: MAX_SHIFT_TYPE_PATTERN,
    regularClosedDays: ["mon", "tue"],
    breakRule: { minWorkMinutes: 360, breakMinutes: 45 },
  }),
].slice(0, MAX_PLAN_LIMITS.maxShops);

// ---------- 募集の期間 ----------

export const USER_SEED_RECRUITMENT_KEYS: readonly UserSeedRecruitmentKey[] = [
  "confirmedPast",
  "confirmedChanged",
  "draft",
  "recruiting",
];

/**
 * 実行した日を基準に、上限の日数の期間を重ならないように4つ置く。今日は「確定後に変更あり」の期間に入る。
 * 全員が提出した状態にする。管理者本人は提出しないため、未提出の人は各募集に1人残る。
 */
export function buildUserSeedMaxRecruitmentWindows(today: string): RecruitmentWindow[] {
  const days = RECRUITMENT_PERIOD_DAYS_MAX;
  const currentStart = addDays(today, -Math.floor(days / 2));
  const window = (index: number) => {
    const periodStart = addDays(currentStart, index * days);
    return { periodStart, periodEnd: addDays(periodStart, days - 1) };
  };
  return [
    {
      key: "confirmedPast",
      status: "confirmed",
      ...window(-1),
      deadline: addDays(window(-1).periodStart, -3),
      unsubmittedCount: 0,
      confirmedDaysAgo: Math.floor(days / 2) + days + 2,
    },
    {
      key: "confirmedChanged",
      status: "confirmed",
      ...window(0),
      deadline: addDays(window(0).periodStart, -3),
      unsubmittedCount: 0,
      confirmedDaysAgo: Math.floor(days / 2) + 2,
    },
    { key: "draft", status: "open", ...window(1), deadline: addDays(today, -1), unsubmittedCount: 0 },
    {
      key: "recruiting",
      status: "open",
      ...window(2),
      deadline: addDays(window(2).periodStart, -7),
      unsubmittedCount: 0,
    },
  ];
}

// ---------- 必要人数 ----------

type TemplateWeekday = Doc<"shiftDayTemplates">["weekdays"][number];

const MAX_TEMPLATES: Array<{ name: string; weekdays: TemplateWeekday[]; appliesToHolidays?: true }> = [
  { name: "月曜", weekdays: ["mon"] },
  { name: "火曜", weekdays: ["tue"] },
  { name: "水曜", weekdays: ["wed"] },
  { name: "木曜", weekdays: ["thu"] },
  { name: "金曜", weekdays: ["fri"] },
  { name: "土曜", weekdays: ["sat"] },
  { name: "日曜", weekdays: ["sun"] },
  { name: "祝日", weekdays: [], appliesToHolidays: true },
  { name: "繁忙日", weekdays: [] },
  { name: "閑散日", weekdays: [] },
];
/** 募集中の期間に1日だけ当てるテンプレート（繁忙日）の位置。 */
const OVERRIDE_TEMPLATE_INDEX = 8;

/**
 * 時間指定の必要人数。バーをテンプレートの上限まで置き、1つ目のポジションは同じ時間に入れられる上限まで重ねる。
 * 保存の形に合わせ、開始、終了、ポジションの順に並べる。
 */
function maxTimeBars(
  pattern: Extract<ShiftSubmissionPattern, { kind: "time" }>,
  positions: SeedShop["positions"],
  templateIndex: number,
) {
  const start = toMinutes(pattern.startTime);
  const end = toMinutes(pattern.endTime);
  const third = Math.floor((end - start) / 3 / 30) * 30;
  const windows = [
    [start, start + third],
    [start + third, start + third * 2],
    [start + third * 2, end],
  ];
  const bars: Array<{ positionIndex: number; start: number; end: number }> = [];
  const push = (positionIndex: number, windowIndex: number) =>
    bars.push({ positionIndex, start: windows[windowIndex % 3][0], end: windows[windowIndex % 3][1] });

  for (let i = 0; i < SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT; i += 1) push(0, templateIndex);
  const otherPositionCount = positions.length - 1;
  for (let i = 0; i < SHIFT_DAY_TEMPLATE_BAR_LIMIT - SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT; i += 1) {
    push(1 + (i % otherPositionCount), Math.floor(i / otherPositionCount));
  }
  return bars
    .sort((a, b) => a.start - b.start || a.end - b.end || a.positionIndex - b.positionIndex)
    .map((bar) => ({
      positionId: positions[bar.positionIndex]._id,
      startTime: toTime(bar.start),
      endTime: toTime(bar.end),
    }));
}

/** テンプレートを上限の件数まで作り、必要人数を上限の人数にする。 */
async function insertMaxTemplates(ctx: MutationCtx, shop: SeedShop): Promise<void> {
  const { pattern } = shop.definition;
  const counts = shop.positions.map((position) => ({
    positionId: position._id,
    count: SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
  }));
  for (const [sortOrder, template] of MAX_TEMPLATES.slice(0, SHIFT_DAY_TEMPLATE_LIMIT).entries()) {
    await ctx.db.insert("shiftDayTemplates", {
      shopId: shop.shopId,
      name: fillName(template.name, SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH),
      sortOrder,
      weekdays: template.weekdays,
      appliesToHolidays: template.appliesToHolidays ?? false,
      requirements:
        pattern.kind === "time"
          ? { kind: "time", bars: maxTimeBars(pattern, shop.positions, sortOrder) }
          : pattern.kind === "dateOnly"
            ? { kind: "dateOnly", counts }
            : { kind: "shiftType", options: pattern.options.map((option) => ({ optionId: option.id, counts })) },
    });
  }
}

// ---------- 希望、メモ、割り当て ----------

const FULL_RANGE_NOTE = "開店から閉店まで入れます";
const MIDNIGHT_NOTE = "深夜の時間帯に入れます";

/** 出勤する日のメモと、そのメモに合う希望。1回の提出に入る希望の数の上限に合わせ、1日に希望は1つにする。 */
function maxWorkNotesFor(
  random: Random,
  pattern: ShiftSubmissionPattern,
  staffIndex: number,
): Record<string, () => Slot[]> {
  const { 通しで入れます: _twoSlots, ...notes } = workNotesFor(random, pattern);
  // 受付時間いっぱいの勤務は、10人に1人だけが希望する。
  if (pattern.kind === "time" && staffIndex % 10 === 1) {
    notes[FULL_RANGE_NOTE] = () => [{ startTime: pattern.startTime, endTime: pattern.endTime }];
  }
  if (pattern.kind === "shiftType" && pattern.options.some((option) => option.id === "midnight")) {
    notes[MIDNIGHT_NOTE] = () => [shiftTypeOption(pattern, "midnight")];
  }
  return notes;
}

/**
 * 1人分の希望を作る。営業する日のすべてにメモを入れ、その日の希望をメモに合わせる。
 * 5人に1人は、2日を休みにする。24時を越える勤務の次の日は、前の日の勤務が終わってから始まる希望にする。
 */
function buildMaxPreferences(
  random: Random,
  pattern: ShiftSubmissionPattern,
  openDates: readonly string[],
  staffIndex: number,
): Preferences {
  const slotsByDate = new Map<string, Slot[]>();
  const workDates: string[] = [];
  const notes: Array<{ date: string; note: string }> = [];
  const workNotes = maxWorkNotesFor(random, pattern, staffIndex);
  const noteKeys = Object.keys(workNotes);
  const offDates = new Set(staffIndex % 5 === 0 ? shuffle(random, openDates).slice(0, 2) : []);

  let previous: { date: string; end: number } | null = null;
  for (const date of openDates) {
    if (offDates.has(date)) {
      notes.push({ date, note: pick(random, USER_SEED_OFF_NOTES) });
      continue;
    }
    const carriedOver = previous && addDays(previous.date, 1) === date ? Math.max(0, previous.end - 24 * 60) : 0;
    let note = "17時以降なら入れます";
    let slots = workNotes[note]();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = pick(random, noteKeys);
      const candidateSlots = workNotes[candidate]();
      if (candidateSlots.every((slot) => toMinutes(slot.startTime) >= carriedOver)) {
        note = candidate;
        slots = candidateSlots;
        break;
      }
    }
    notes.push({ date, note });
    workDates.push(date);
    if (slots.length > 0) {
      slotsByDate.set(date, slots);
      previous = { date, end: Math.max(...slots.map((slot) => toMinutes(slot.endTime))) };
    }
  }
  return { slotsByDate, workDates, notes };
}

/** 受付時間いっぱいの勤務には、入れられる上限まで休憩を入れる。ほかの勤務は休憩の決まりに合わせる。 */
function maxBreaksFor(shop: SeedShop, slot: Slot): AssignmentCore["breaks"] {
  const { pattern } = shop.definition;
  if (pattern.kind !== "time" || slot.startTime !== pattern.startTime || slot.endTime !== pattern.endTime) {
    return breaksFor(shop, slot);
  }
  const start = toMinutes(slot.startTime);
  const count = Math.min(SHIFT_ASSIGNMENT_BREAK_LIMIT, Math.floor((toMinutes(slot.endTime) - start - 30) / 60));
  return Array.from({ length: count }, (_, index) => ({
    startTime: toTime(start + 30 + index * 60),
    endTime: toTime(start + 60 + index * 60),
  }));
}

const MAX_RECRUITMENT_PROFILE: RecruitmentProfile = {
  preferencesFor: (random, shop, openDates, staffIndex) =>
    buildMaxPreferences(random, shop.definition.pattern, openDates, staffIndex),
  // すべての希望を、希望どおりの時間で割り当てる。
  assignmentRate: 1,
  noteText: fillNote,
  breaksFor: maxBreaksFor,
};

// ---------- 書き込み ----------

export type UserSeedMaxShopSummary = {
  shopId: Id<"shops">;
  name: string;
  staffCount: number;
  recruitments: UserSeedRecruitmentSummary[];
};

export type UserSeedMaxOrganizationSummary = {
  organizationId: Id<"organizations">;
  name: string;
  /** 上限いっぱいの組織か。募集は、このあと店舗ごとに`seedUserMaxRecruitment`で入れる。 */
  isMax: boolean;
  shops: UserSeedMaxShopSummary[];
};

/**
 * 選んだ管理者ユーザーに、作れる上限の数だけTrialの組織を作る。
 * 1つ目は店舗、人、ポジション、必要人数を上限まで入れ、募集は入れない。残りは`/seed`の1店舗ぶんを入れる。
 * 1回のmutationで全件を書き、途中で失敗した場合は何も残さない。
 */
export async function seedUserMaxOrganizations(
  ctx: MutationCtx,
  args: { user: Doc<"users">; today: string; now: number; randomSeed: number },
): Promise<{ organizations: UserSeedMaxOrganizationSummary[]; noteMismatchCount: number }> {
  const { user, today, now } = args;
  const random = createSeedRandom(args.randomSeed);
  const organizations: UserSeedMaxOrganizationSummary[] = [];
  let noteMismatchCount = 0;

  for (let order = 1; order <= ORGANIZATION_SELF_CREATED_LIMIT; order += 1) {
    // 消さずに残した組織があると、上限の数まで作れない。その場合は何も残さずに止める。
    const availability = await getOrganizationCreationAvailability(ctx, user);
    if (!availability.canCreate) throw new Error(availability.reason);

    if (order === 1) {
      organizations.push(await insertMaxOrganization(ctx, { user, now, random }));
      continue;
    }
    const name = lightOrganizationName(order);
    const { organizationId, managerPersonId } = await insertOrganization(ctx, { user, name, now });
    const staffPeople = await insertStaffPeople(ctx, {
      organizationId,
      people: USER_SEED_STAFF_NAMES.slice(0, LIGHT_STAFF_COUNT).map((staffName, index) => ({
        name: staffName,
        email: userSeedStaffEmail(index),
      })),
      now,
    });
    // 2つ目は時間指定、3つ目はパターン選択の店舗にする。
    const definition = USER_SEED_SHOPS[((order - 2) * 2) % USER_SEED_SHOPS.length];
    const shop = await insertStandardShop(ctx, {
      definition,
      organizationId,
      user,
      managerPersonId,
      staffPeople,
      today,
      now,
      random,
    });
    noteMismatchCount += shop.noteMismatchCount;
    organizations.push({ organizationId, name, isMax: false, shops: [{ shopId: shop.shopId, ...shop.summary }] });
  }
  return { organizations, noteMismatchCount };
}

async function insertMaxOrganization(
  ctx: MutationCtx,
  args: { user: Doc<"users">; now: number; random: Random },
): Promise<UserSeedMaxOrganizationSummary> {
  const { user, now, random } = args;
  const name = USER_SEED_MAX_ORGANIZATION_NAME;
  const { organizationId, managerPersonId, managerMemberId } = await insertOrganization(ctx, { user, name, now });
  const staffPeople = await insertStaffPeople(ctx, {
    organizationId,
    people: Array.from({ length: USER_SEED_MAX_STAFF_COUNT }, (_, index) => ({
      name: personName(index),
      email: longEmail("devstaff", index),
    })),
    now,
  });

  // 管理者の上限まで、スタッフを管理者に招待した状態にする。
  // tokenの照合値には、実際のtokenからは作れない値を入れる。この招待から管理者になることはできない。
  for (const person of staffPeople.slice(0, USER_SEED_MAX_INVITATION_COUNT)) {
    await ctx.db.insert("organizationInvitations", {
      organizationId,
      email: person.email,
      emailNormalized: person.email,
      invitedName: person.name,
      tokenDigest: `user-seed:${generateUUID()}`,
      status: "issued",
      inviterMemberId: managerMemberId,
      targetPersonId: person.personId,
      // すでに利用人数に数えているスタッフなので、人数の枠は取らない。
      reservedSeat: false,
      version: 1,
      expiresAt: getOrganizationInvitationExpiresAt(now),
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  const shops: UserSeedMaxShopSummary[] = [];
  for (const definition of USER_SEED_MAX_SHOPS) {
    const shop = await insertShop(ctx, { definition, organizationId, user, managerPersonId, staffPeople, random });
    await insertMaxTemplates(ctx, shop);
    if (definition.key === "dateOnly") {
      for (let index = 0; index < STAFF_REGISTRATION_PENDING_LIMIT; index += 1) {
        await insertRegistrationRequest(ctx, {
          shopId: shop.shopId,
          name: personName(USER_SEED_MAX_STAFF_COUNT + index),
          email: longEmail("devstaff-request", index),
          now,
        });
      }
    }
    shops.push({ shopId: shop.shopId, name: definition.name, staffCount: shop.staffCount, recruitments: [] });
  }
  return { organizationId, name, isMax: true, shops };
}

/**
 * 上限いっぱいの組織の店舗1つに、募集1つと、その希望、メモ、割り当てを入れる。
 * 件数が1回のmutationの上限を超えないよう、募集ごとに分けて呼ぶ。
 */
export async function seedUserMaxRecruitment(
  ctx: MutationCtx,
  args: {
    user: Doc<"users">;
    shop: Doc<"shops">;
    recruitmentKey: UserSeedRecruitmentKey;
    today: string;
    now: number;
    randomSeed: number;
  },
): Promise<{ summary: UserSeedRecruitmentSummary; noteMismatchCount: number }> {
  const { user, shop, today, now } = args;
  const window = buildUserSeedMaxRecruitmentWindows(today).find((candidate) => candidate.key === args.recruitmentKey);
  if (!window) throw new Error(`Unknown recruitment key: ${args.recruitmentKey}`);

  const [positions, staffs, templates, existingRecruitments] = await Promise.all([
    ctx.db
      .query("positions")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .take(POSITION_ACTIVE_LIMIT),
    ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
      .take(SHIFT_BOARD_STAFF_LIMIT),
    ctx.db
      .query("shiftDayTemplates")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .take(SHIFT_DAY_TEMPLATE_LIMIT),
    ctx.db
      .query("recruitments")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .take(USER_SEED_RECRUITMENT_KEYS.length),
  ]);
  // 同じ募集を2回入れない。やり直すときは、組織を消してから入れ直す。
  if (existingRecruitments.some((recruitment) => recruitment.periodStart === window.periodStart)) {
    throw new Error("User seed max recruitment already exists");
  }
  positions.sort((a, b) => a.sortOrder - b.sortOrder);
  templates.sort((a, b) => a.sortOrder - b.sortOrder);
  const templateIds: TemplateIds = {
    weekday: templates[0]._id,
    weekend: templates[Math.min(OVERRIDE_TEMPLATE_INDEX, templates.length - 1)]._id,
  };

  const seedShop: SeedShop = {
    definition: {
      key: shop.submissionPattern.kind,
      name: shop.name,
      pattern: shop.submissionPattern,
      regularClosedDays: shop.regularClosedDays,
      breakRule: shop.breakRule ?? { minWorkMinutes: 0, breakMinutes: 0 },
      positions: positions.map((position) => ({ name: position.name, color: position.color })),
      workRate: 1,
    },
    shopId: shop._id,
    positions,
    staffs: staffs
      .filter((staff) => !staff.excludedFromShift)
      .map((staff) => ({
        staffId: staff._id,
        name: staff.name,
        isManager: staff.userId === user._id,
        skills: new Map((staff.positionSkills ?? []).map((skill) => [skill.positionId, skill.level])),
      })),
    staffCount: staffs.length,
  };
  return await insertRecruitment(ctx, {
    shop: seedShop,
    window,
    templates: templateIds,
    now,
    random: createSeedRandom(args.randomSeed),
    profile: MAX_RECRUITMENT_PROFILE,
  });
}
