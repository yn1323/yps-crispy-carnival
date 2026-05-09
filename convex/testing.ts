import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { APP_URL } from "./_lib/config";
import { buildLineAuthorizeUrl } from "./_lib/lineClient";
import { generateUUID } from "./_lib/uuid";
import { LEGAL_CONSENT_TOKEN_TTL_MS, LINE_LINK_TOKEN_TTL_MS, MAGIC_LINK_DEFAULT_TTL_MS } from "./constants";
import { getLegalConsentVersions, type LegalAudience } from "./legal/documents";
import schema from "./schema";

const TABLE_NAMES = Object.keys(schema.tables) as (keyof typeof schema.tables)[];
const magicLinkPurposeValidator = v.union(v.literal("submit"), v.literal("view"));
const scenarioDatesValidator = v.object({
  periodStart: v.string(),
  periodEnd: v.string(),
  deadline: v.string(),
  dates: v.array(v.string()),
});
const legalConsentStateValidator = v.union(
  v.literal("current"),
  v.literal("missing"),
  v.literal("oldRequired"),
  v.literal("oldDocumentOnly"),
);

const DEFAULT_MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

type MagicLinkPurpose = "submit" | "view";
type TestCtx = QueryCtx | MutationCtx;
type ScenarioDates = {
  periodStart: string;
  periodEnd: string;
  deadline: string;
  dates: string[];
};
type LegalConsentState = "current" | "missing" | "oldRequired" | "oldDocumentOnly";

function assertE2EHelpersEnabled() {
  if (process.env.E2E_TESTING_ENABLED !== "true") {
    throw new Error("E2E testing helpers are disabled. Set E2E_TESTING_ENABLED=true in the Convex deployment.");
  }
}

async function findActiveStaffByEmail(ctx: TestCtx, staffEmail: string) {
  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_email", (q) => q.eq("email", staffEmail))
    .order("desc")
    .take(10);
  return staffs.find((staff) => !staff.isDeleted) ?? null;
}

function matchesPurpose(status: "open" | "confirmed", purpose: MagicLinkPurpose) {
  return purpose === "submit" ? status === "open" : status === "confirmed";
}

function legalConsentFields(audience: LegalAudience, state: LegalConsentState = "current") {
  if (state === "missing") return {};

  const versions = getLegalConsentVersions(audience);
  const consentVersions =
    state === "oldRequired"
      ? {
          legalTermsConsentVersion: `${versions.termsConsentVersion}-old`,
          legalPrivacyConsentVersion: `${versions.privacyConsentVersion}-old`,
        }
      : {
          legalTermsConsentVersion: versions.termsConsentVersion,
          legalPrivacyConsentVersion: versions.privacyConsentVersion,
        };
  const documentVersions =
    state === "oldDocumentOnly"
      ? {
          legalTermsDocumentVersion: `${versions.termsDocumentVersion}-old`,
          legalPrivacyDocumentVersion: `${versions.privacyDocumentVersion}-old`,
        }
      : {
          legalTermsDocumentVersion: versions.termsDocumentVersion,
          legalPrivacyDocumentVersion: versions.privacyDocumentVersion,
        };

  return {
    ...consentVersions,
    ...documentVersions,
    legalConsentedAt: Date.now() - 1000,
    legalConsentMethod: audience === "manager" ? "manager_setup" : "staff_email_link",
  };
}

async function deleteRecruitmentGraph(ctx: MutationCtx, recruitmentId: Id<"recruitments">) {
  const [requests, submissions, assignments] = await Promise.all([
    ctx.db
      .query("shiftRequests")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
    ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
    ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
  ]);

  for (const doc of [...requests, ...submissions, ...assignments]) {
    await ctx.db.delete(doc._id);
  }
}

async function deleteStaffAuthGraph(ctx: MutationCtx, staffId: Id<"staffs">) {
  const [magicLinks, lineLinkTokens, sessions] = await Promise.all([
    ctx.db
      .query("magicLinks")
      .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
      .collect(),
    ctx.db
      .query("lineLinkTokens")
      .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
      .collect(),
    ctx.db
      .query("sessions")
      .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
      .collect(),
  ]);

  for (const doc of [...magicLinks, ...lineLinkTokens, ...sessions]) {
    await ctx.db.delete(doc._id);
  }
}

async function deleteShopGraph(ctx: MutationCtx, shopId: Id<"shops">) {
  const recruitments = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .collect();
  for (const recruitment of recruitments) {
    await deleteRecruitmentGraph(ctx, recruitment._id);
    await ctx.db.delete(recruitment._id);
  }

  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .collect();
  for (const staff of staffs) {
    await deleteStaffAuthGraph(ctx, staff._id);
    await ctx.db.delete(staff._id);
  }

  const positions = await ctx.db
    .query("positions")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .collect();
  for (const position of positions) {
    await ctx.db.delete(position._id);
  }

  await ctx.db.delete(shopId);
}

async function resetOwnerScenarioData(ctx: MutationCtx, ownerId: string) {
  const shops = await ctx.db
    .query("shops")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .collect();
  for (const shop of shops) {
    await deleteShopGraph(ctx, shop._id);
  }

  const users = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", ownerId))
    .collect();
  for (const user of users) {
    await ctx.db.delete(user._id);
  }
}

async function createOwnerScenario(
  ctx: MutationCtx,
  args: {
    ownerId: string;
    ownerEmail?: string;
    shopName: string;
    managerLegalConsentState?: LegalConsentState;
    managerStaffLegalConsentState?: LegalConsentState;
  },
) {
  assertE2EHelpersEnabled();
  if (!args.ownerId) throw new Error("ownerId is required");
  await resetOwnerScenarioData(ctx, args.ownerId);

  const userId = await ctx.db.insert("users", {
    clerkId: args.ownerId,
    name: DEFAULT_MANAGER.name,
    email: args.ownerEmail ?? DEFAULT_MANAGER.email,
    role: "manager",
    ...legalConsentFields("manager", args.managerLegalConsentState),
    isDeleted: false,
  });
  const shopId = await ctx.db.insert("shops", {
    name: args.shopName,
    shiftStartTime: "09:00",
    shiftEndTime: "22:00",
    ownerId: args.ownerId,
    isDeleted: false,
  });
  const managerStaffId = await ctx.db.insert("staffs", {
    shopId,
    name: DEFAULT_MANAGER.name,
    email: DEFAULT_MANAGER.email,
    userId,
    ...legalConsentFields("staff", args.managerStaffLegalConsentState),
    isDeleted: false,
  });

  return { shopId, userId, managerStaffId };
}

async function createStaff(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    name: string;
    email: string;
    lineUserId?: string;
    lineFollowing?: boolean;
    legalConsentState?: LegalConsentState;
  },
) {
  return await ctx.db.insert("staffs", {
    shopId: args.shopId,
    name: args.name,
    email: args.email,
    lineUserId: args.lineUserId,
    lineFollowing: args.lineFollowing,
    ...legalConsentFields("staff", args.legalConsentState),
    isDeleted: false,
  });
}

async function createRecruitment(
  ctx: MutationCtx,
  args: {
    shopId: Id<"shops">;
    dates: ScenarioDates;
    status: "open" | "confirmed";
  },
) {
  return await ctx.db.insert("recruitments", {
    shopId: args.shopId,
    periodStart: args.dates.periodStart,
    periodEnd: args.dates.periodEnd,
    deadline: args.dates.deadline,
    status: args.status,
    confirmedAt: args.status === "confirmed" ? Date.now() : undefined,
    isDeleted: false,
    shiftStartTime: "09:00",
    shiftEndTime: "22:00",
  });
}

async function createMagicLink(
  ctx: MutationCtx,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    recruitmentId: Id<"recruitments">;
  },
) {
  const token = generateUUID();
  await ctx.db.insert("magicLinks", {
    token,
    staffId: args.staffId,
    shopId: args.shopId,
    recruitmentId: args.recruitmentId,
    expiresAt: Date.now() + MAGIC_LINK_DEFAULT_TTL_MS,
  });
  return token;
}

async function createLineLinkToken(ctx: MutationCtx, args: { staffId: Id<"staffs">; shopId: Id<"shops"> }) {
  const token = generateUUID();
  await ctx.db.insert("lineLinkTokens", {
    staffId: args.staffId,
    shopId: args.shopId,
    token,
    expiresAt: Date.now() + LINE_LINK_TOKEN_TTL_MS,
  });
  return token;
}

async function findRecruitmentForPurpose(
  ctx: TestCtx,
  staff: { shopId: Id<"shops"> },
  purpose: MagicLinkPurpose,
  recruitmentId?: Id<"recruitments">,
) {
  if (recruitmentId) {
    const recruitment = await ctx.db.get(recruitmentId);
    if (
      recruitment &&
      !recruitment.isDeleted &&
      recruitment.shopId === staff.shopId &&
      matchesPurpose(recruitment.status, purpose)
    ) {
      return recruitment;
    }
    return null;
  }

  const status = purpose === "submit" ? "open" : "confirmed";
  const recruitments = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_status", (q) => q.eq("shopId", staff.shopId).eq("status", status))
    .order("desc")
    .take(10);
  return recruitments.find((recruitment) => !recruitment.isDeleted) ?? null;
}

/**
 * E2Eテスト用：全テーブルのデータをクリア
 * GitHub Actionsでseed import前に実行
 */
export const clearAllTables = internalMutation(async ({ db }) => {
  assertE2EHelpersEnabled();

  for (const tableName of TABLE_NAMES) {
    const docs = await db.query(tableName).collect();
    for (const doc of docs) {
      await db.delete(doc._id);
    }
  }
  return { cleared: TABLE_NAMES };
});

/**
 * E2Eテスト用：最新shop/staffs/recruitmentのIDを取得し、shiftAssignmentsを一括挿入
 * getTestIds + seedAssignments を1関数に統合してCLI round-tripを削減
 */
export const seedShiftData = internalMutation({
  args: {
    staffAssignments: v.array(
      v.object({
        staffName: v.string(),
        shifts: v.array(
          v.object({
            dateIndex: v.number(),
            startTime: v.string(),
            endTime: v.string(),
          }),
        ),
      }),
    ),
    dates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const shops = await ctx.db.query("shops").order("desc").take(1);
    const shop = shops[0];
    if (!shop) throw new Error("No shop found");

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .collect();
    const activeStaffs = staffs.filter((s) => !s.isDeleted);

    const recruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .order("desc")
      .take(1);
    const recruitment = recruitments[0];
    if (!recruitment) throw new Error("No recruitment found");

    let inserted = 0;
    for (const sa of args.staffAssignments) {
      const staff = activeStaffs.find((s) => s.name === sa.staffName);
      if (!staff) throw new Error(`Staff not found: ${sa.staffName}`);

      for (const shift of sa.shifts) {
        await ctx.db.insert("shiftAssignments", {
          recruitmentId: recruitment._id,
          staffId: staff._id,
          date: args.dates[shift.dateIndex],
          startTime: shift.startTime,
          endTime: shift.endTime,
        });
        inserted++;
      }
    }

    return { inserted };
  },
});

/**
 * E2Eテスト用：ページネーション検証データをセットアップ
 * completeSetup でshop/user作成済み前提。staffs 12人 + recruitments 8件を投入
 */
export const seedPaginationTestData = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertE2EHelpersEnabled();

    const shop = await ctx.db.query("shops").order("desc").first();
    if (!shop) throw new Error("No shop found. Run completeSetup first.");

    // スタッフ12人を追加
    for (let i = 1; i <= 12; i++) {
      await ctx.db.insert("staffs", {
        shopId: shop._id,
        name: `スタッフ${String(i).padStart(2, "0")}`,
        email: `staff${i}@example.com`,
        isDeleted: false,
      });
    }

    // シフト募集8件を作成（1週間ずつずらす）
    const baseDate = new Date("2026-05-04"); // 日曜始まり
    for (let i = 0; i < 8; i++) {
      const start = new Date(baseDate);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const deadline = new Date(start);
      deadline.setDate(deadline.getDate() - 1);

      await ctx.db.insert("recruitments", {
        shopId: shop._id,
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
        deadline: deadline.toISOString().slice(0, 10),
        status: "open",
        isDeleted: false,
      });
    }

    return { staffsInserted: 12, recruitmentsInserted: 8 };
  },
});

/**
 * 探索的テスト用：最新shop/recruitmentにスタッフ15人と現実的な希望シフトを投入
 */
export const seedRealisticStaffRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertE2EHelpersEnabled();

    const shop = await ctx.db.query("shops").order("desc").first();
    if (!shop) throw new Error("No shop found");

    const recruitment = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
      .order("desc")
      .first();
    if (!recruitment) throw new Error("No recruitment found");

    const start = new Date(recruitment.periodStart);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const isWeekend = (i: number) => {
      const dow = new Date(dates[i]).getDay();
      return dow === 0 || dow === 6;
    };

    type Pattern = {
      name: string;
      email: string;
      mode: "requests" | "allOff" | "unsubmitted";
      pick: (i: number) => { startTime: string; endTime: string } | null;
    };
    const patterns: Pattern[] = [
      {
        name: "田中 健太",
        email: "tanaka.kenta@example.com",
        mode: "requests",
        pick: (i) =>
          isWeekend(i) ? { startTime: "17:00", endTime: "25:00" } : { startTime: "19:00", endTime: "23:00" },
      },
      {
        name: "佐藤 美咲",
        email: "sato.misaki@example.com",
        mode: "requests",
        pick: (i) => (i === 3 ? null : { startTime: "17:00", endTime: "24:00" }),
      },
      {
        name: "鈴木 翔太",
        email: "suzuki.shota@example.com",
        mode: "requests",
        pick: (i) => ([1, 3, 4].includes(i) ? { startTime: "18:00", endTime: "23:00" } : null),
      },
      {
        name: "高橋 由美",
        email: "takahashi.yumi@example.com",
        mode: "requests",
        pick: (i) => ([4, 5].includes(i) ? { startTime: "17:00", endTime: "22:00" } : null),
      },
      {
        name: "伊藤 直樹",
        email: "ito.naoki@example.com",
        mode: "requests",
        pick: (i) => (isWeekend(i) ? { startTime: "17:00", endTime: "21:00" } : null),
      },
      {
        name: "渡辺 彩香",
        email: "watanabe.ayaka@example.com",
        mode: "requests",
        pick: (i) => ([0, 2, 5].includes(i) ? { startTime: "18:30", endTime: "23:00" } : null),
      },
      {
        name: "山本 隆",
        email: "yamamoto.takashi@example.com",
        mode: "requests",
        pick: (i) => (i === 2 ? null : { startTime: "17:00", endTime: "25:00" }),
      },
      {
        name: "中村 愛",
        email: "nakamura.ai@example.com",
        mode: "unsubmitted",
        pick: () => null,
      },
      {
        name: "小林 陽介",
        email: "kobayashi.yosuke@example.com",
        mode: "requests",
        pick: (i) => (isWeekend(i) ? { startTime: "17:00", endTime: "24:00" } : null),
      },
      {
        name: "加藤 真理",
        email: "kato.mari@example.com",
        mode: "requests",
        pick: (i) => (!isWeekend(i) ? { startTime: "18:00", endTime: "22:00" } : null),
      },
      {
        name: "吉田 亮",
        email: "yoshida.ryo@example.com",
        mode: "requests",
        pick: (i) => (i === 6 ? null : { startTime: "17:00", endTime: "24:30" }),
      },
      {
        name: "山田 美穂",
        email: "yamada.miho@example.com",
        mode: "requests",
        pick: (i) => ([0, 2, 4].includes(i) ? { startTime: "18:00", endTime: "23:00" } : null),
      },
      {
        name: "佐々木 翔",
        email: "sasaki.sho@example.com",
        mode: "requests",
        pick: (i) => ([1, 4, 5, 6].includes(i) ? { startTime: "17:30", endTime: "22:30" } : null),
      },
      {
        name: "松本 涼子",
        email: "matsumoto.ryoko@example.com",
        mode: "allOff",
        pick: () => null,
      },
      {
        name: "井上 大樹",
        email: "inoue.daiki@example.com",
        mode: "requests",
        pick: (i) => ([2, 5].includes(i) ? { startTime: "19:00", endTime: "23:00" } : null),
      },
    ];

    let staffInserted = 0;
    let requestsInserted = 0;
    let submissionsInserted = 0;

    for (const p of patterns) {
      const staffId = await ctx.db.insert("staffs", {
        shopId: shop._id,
        name: p.name,
        email: p.email,
        isDeleted: false,
      });
      staffInserted++;

      if (p.mode === "unsubmitted") continue;

      for (let i = 0; i < 7; i++) {
        const slot = p.pick(i);
        if (!slot) continue;
        await ctx.db.insert("shiftRequests", {
          recruitmentId: recruitment._id,
          staffId,
          date: dates[i],
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
        requestsInserted++;
      }

      await ctx.db.insert("shiftSubmissions", {
        recruitmentId: recruitment._id,
        staffId,
        submittedAt: Date.now(),
      });
      submissionsInserted++;
    }

    return { staffInserted, requestsInserted, submissionsInserted, dates };
  },
});

/**
 * 探索的テスト用：シフト提出画面のテストデータを一括セットアップ
 * shop + staff + recruitment + magicLink + session を作成し、sessionTokenを返す
 */
export const seedSubmitTestData = internalMutation({
  args: {
    deadlinePassed: v.optional(v.boolean()),
    hasExistingSubmission: v.optional(v.boolean()),
    legalConsentState: v.optional(legalConsentStateValidator),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const shopId = await ctx.db.insert("shops", {
      name: "テスト居酒屋さくら",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "test_owner",
      isDeleted: false,
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "田中太郎",
      email: "tanaka@example.com",
      ...legalConsentFields("staff", args.legalConsentState),
      isDeleted: false,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-04-07",
      periodEnd: "2026-04-13",
      deadline: args.deadlinePassed ? "2026-01-01" : "2026-12-31",
      status: "open",
      isDeleted: false,
    });

    // magic link token
    const token = `test-token-${Date.now()}`;
    await ctx.db.insert("magicLinks", {
      token,
      staffId,
      shopId,
      recruitmentId,
      expiresAt: Date.now() + MAGIC_LINK_DEFAULT_TTL_MS,
    });

    // 既存提出がある場合
    if (args.hasExistingSubmission) {
      await Promise.all([
        ctx.db.insert("shiftRequests", {
          recruitmentId,
          staffId,
          date: "2026-04-07",
          startTime: "09:00",
          endTime: "18:00",
        }),
        ctx.db.insert("shiftRequests", {
          recruitmentId,
          staffId,
          date: "2026-04-09",
          startTime: "10:00",
          endTime: "15:00",
        }),
        ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId,
          submittedAt: Date.now(),
        }),
      ]);
    }

    return { token, shopId, staffId, recruitmentId };
  },
});

export const seedDashboardPaginationScenario = internalMutation({
  args: {
    ownerId: v.string(),
    ownerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { shopId } = await createOwnerScenario(ctx, {
      ownerId: args.ownerId,
      ownerEmail: args.ownerEmail,
      shopName: "ページネーションテスト店舗",
    });

    for (let i = 1; i <= 12; i++) {
      await createStaff(ctx, {
        shopId,
        name: `スタッフ${String(i).padStart(2, "0")}`,
        email: `staff${i}@example.com`,
      });
    }

    const baseDate = new Date("2026-05-04");
    for (let i = 0; i < 8; i++) {
      const start = new Date(baseDate);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const deadline = new Date(start);
      deadline.setDate(deadline.getDate() - 1);

      await ctx.db.insert("recruitments", {
        shopId,
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
        deadline: deadline.toISOString().slice(0, 10),
        status: "open",
        isDeleted: false,
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
      });
    }

    return { shopId, staffsInserted: 12, recruitmentsInserted: 8 };
  },
});

export const seedLegalManagerConsentScenario = internalMutation({
  args: {
    ownerId: v.string(),
    ownerEmail: v.optional(v.string()),
    legalConsentState: legalConsentStateValidator,
  },
  handler: async (ctx, args) => {
    const { shopId, userId } = await createOwnerScenario(ctx, {
      ownerId: args.ownerId,
      ownerEmail: args.ownerEmail,
      shopName: "法務同意テスト店舗",
      managerLegalConsentState: args.legalConsentState,
    });
    return { shopId, userId };
  },
});

export const seedLegalStaffConsentPageScenario = internalMutation({
  args: {
    legalConsentState: v.optional(legalConsentStateValidator),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const shopId = await ctx.db.insert("shops", {
      name: "法務同意テスト店舗",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "legal_test_owner",
      isDeleted: false,
    });
    const staffId = await createStaff(ctx, {
      shopId,
      name: "佐藤花子",
      email: "sato@example.com",
      legalConsentState: args.legalConsentState ?? "missing",
    });
    const token = generateUUID();
    const expiresAt = Date.now() + LEGAL_CONSENT_TOKEN_TTL_MS;
    await ctx.db.insert("legalConsentTokens", {
      staffId,
      shopId,
      token,
      method: "staff_email_link",
      expiresAt,
    });
    return { token, shopId, staffId, expiresAt };
  },
});

export const seedLegalStaffSubmitScenario = internalMutation({
  args: {
    legalConsentState: legalConsentStateValidator,
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();
    const shopId = await ctx.db.insert("shops", {
      name: "法務同意テスト店舗",
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
      ownerId: "legal_test_owner",
      isDeleted: false,
    });
    const staffId = await createStaff(ctx, {
      shopId,
      name: "佐藤花子",
      email: "sato@example.com",
      legalConsentState: args.legalConsentState,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-04-07",
      periodEnd: "2026-04-13",
      deadline: "2026-12-31",
      status: "open",
      isDeleted: false,
      shiftStartTime: "09:00",
      shiftEndTime: "22:00",
    });
    const token = await createMagicLink(ctx, { staffId, shopId, recruitmentId });
    return { token, shopId, staffId, recruitmentId };
  },
});

export const seedNotificationSubmitScenario = internalMutation({
  args: {
    ownerId: v.string(),
    ownerEmail: v.optional(v.string()),
    dates: scenarioDatesValidator,
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createOwnerScenario(ctx, {
      ownerId: args.ownerId,
      ownerEmail: args.ownerEmail,
      shopName: "通知募集テスト店舗",
    });
    const recruitmentId = await createRecruitment(ctx, { shopId, dates: args.dates, status: "open" });
    const token = await createMagicLink(ctx, { staffId: managerStaffId, shopId, recruitmentId });

    return { shopId, recruitmentId, token, staffId: managerStaffId };
  },
});

export const seedOpenRecruitmentNotificationScenario = internalMutation({
  args: {
    ownerId: v.string(),
    ownerEmail: v.optional(v.string()),
    dates: scenarioDatesValidator,
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createOwnerScenario(ctx, {
      ownerId: args.ownerId,
      ownerEmail: args.ownerEmail,
      shopName: "追加通知テスト店舗",
    });
    const recruitmentId = await createRecruitment(ctx, { shopId, dates: args.dates, status: "open" });

    return { shopId, recruitmentId, staffId: managerStaffId };
  },
});

export const seedNotificationReminderScenario = internalMutation({
  args: {
    ownerId: v.string(),
    ownerEmail: v.optional(v.string()),
    dates: scenarioDatesValidator,
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createOwnerScenario(ctx, {
      ownerId: args.ownerId,
      ownerEmail: args.ownerEmail,
      shopName: "通知催促テスト店舗",
    });
    const remindedStaffId = await createStaff(ctx, {
      shopId,
      name: "佐藤花子",
      email: "sato@example.com",
    });
    const recruitmentId = await createRecruitment(ctx, { shopId, dates: args.dates, status: "open" });

    await ctx.db.insert("shiftRequests", {
      recruitmentId,
      staffId: managerStaffId,
      date: args.dates.dates[0],
      startTime: "09:00",
      endTime: "18:00",
    });
    await ctx.db.insert("shiftSubmissions", {
      recruitmentId,
      staffId: managerStaffId,
      submittedAt: Date.now(),
    });
    const reminderToken = await createMagicLink(ctx, { staffId: remindedStaffId, shopId, recruitmentId });

    return { shopId, recruitmentId, reminderToken, managerStaffId, remindedStaffId };
  },
});

export const seedNotificationConfirmationViewScenario = internalMutation({
  args: {
    ownerId: v.string(),
    ownerEmail: v.optional(v.string()),
    dates: scenarioDatesValidator,
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createOwnerScenario(ctx, {
      ownerId: args.ownerId,
      ownerEmail: args.ownerEmail,
      shopName: "確定シフト閲覧テスト店舗",
    });
    const recruitmentId = await createRecruitment(ctx, { shopId, dates: args.dates, status: "confirmed" });
    await ctx.db.insert("shiftAssignments", {
      recruitmentId,
      staffId: managerStaffId,
      date: args.dates.dates[0],
      startTime: "10:00",
      endTime: "18:00",
    });
    const viewToken = await createMagicLink(ctx, { staffId: managerStaffId, shopId, recruitmentId });

    return { shopId, recruitmentId, viewToken, staffId: managerStaffId };
  },
});

export const seedLineLinkScenario = internalMutation({
  args: {
    ownerId: v.string(),
    ownerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { shopId, managerStaffId } = await createOwnerScenario(ctx, {
      ownerId: args.ownerId,
      ownerEmail: args.ownerEmail,
      shopName: "LINE連携テスト店舗",
    });

    return { shopId, staffId: managerStaffId };
  },
});

export const getLatestMagicLinkToken = internalQuery({
  args: {
    recruitmentId: v.optional(v.id("recruitments")),
    staffEmail: v.string(),
    purpose: magicLinkPurposeValidator,
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail);
    if (!staff) return { token: null };

    const links = await ctx.db
      .query("magicLinks")
      .withIndex("by_staffId", (q) => q.eq("staffId", staff._id))
      .order("desc")
      .take(50);

    for (const link of links) {
      if (args.recruitmentId && link.recruitmentId !== args.recruitmentId) continue;
      const recruitment = await ctx.db.get(link.recruitmentId);
      if (!recruitment || recruitment.isDeleted || !matchesPurpose(recruitment.status, args.purpose)) continue;
      return {
        token: link.token,
        staffId: staff._id,
        recruitmentId: link.recruitmentId,
        expiresAt: link.expiresAt,
        usedAt: link.usedAt ?? null,
      };
    }

    return { token: null };
  },
});

export const createMagicLinkTokenForLatestRecruitment = internalMutation({
  args: {
    recruitmentId: v.optional(v.id("recruitments")),
    staffEmail: v.string(),
    purpose: magicLinkPurposeValidator,
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail);
    if (!staff) throw new Error(`Staff not found: ${args.staffEmail}`);

    const recruitment = await findRecruitmentForPurpose(ctx, staff, args.purpose, args.recruitmentId);
    if (!recruitment) throw new Error(`Recruitment not found for ${args.purpose}: ${args.staffEmail}`);

    const token = generateUUID();
    await ctx.db.insert("magicLinks", {
      token,
      staffId: staff._id,
      shopId: staff.shopId,
      recruitmentId: recruitment._id,
      expiresAt: Date.now() + MAGIC_LINK_DEFAULT_TTL_MS,
    });

    return { token, staffId: staff._id, recruitmentId: recruitment._id };
  },
});

export const getLatestLineLinkToken = internalQuery({
  args: {
    staffEmail: v.string(),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail);
    if (!staff) return { token: null };

    const links = await ctx.db
      .query("lineLinkTokens")
      .withIndex("by_staffId", (q) => q.eq("staffId", staff._id))
      .order("desc")
      .take(10);
    const link = links[0];
    if (!link) return { token: null };

    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    return {
      token: link.token,
      staffId: staff._id,
      expiresAt: link.expiresAt,
      usedAt: link.usedAt ?? null,
      authorizeUrl: channelId
        ? buildLineAuthorizeUrl({
            channelId,
            redirectUri: `${APP_URL}/line/callback`,
            state: link.token,
          })
        : null,
    };
  },
});

export const createLineLinkTokenForStaff = internalMutation({
  args: {
    staffEmail: v.string(),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail);
    if (!staff) throw new Error(`Staff not found: ${args.staffEmail}`);

    const token = await createLineLinkToken(ctx, { staffId: staff._id, shopId: staff.shopId });

    return { token, staffId: staff._id };
  },
});

export const simulateLineFollowForStaff = internalMutation({
  args: {
    staffEmail: v.string(),
  },
  handler: async (ctx, args) => {
    assertE2EHelpersEnabled();

    const staff = await findActiveStaffByEmail(ctx, args.staffEmail);
    if (!staff) throw new Error(`Staff not found: ${args.staffEmail}`);

    const wasFollowing = Boolean(staff.lineFollowing);
    const lineUserId = staff.lineUserId ?? `U_e2e_${Date.now()}`;
    await ctx.db.patch(staff._id, {
      lineUserId,
      lineFollowing: true,
      lineLinkedAt: staff.lineLinkedAt ?? Date.now(),
    });
    if (!wasFollowing) {
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationLinesForStaff, {
        staffId: staff._id,
      });
    }

    return { staffId: staff._id, lineUserId, scheduled: !wasFollowing };
  },
});
