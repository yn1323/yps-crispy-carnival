import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { buildLineAuthorizeUrl } from "./_lib/lineClient";
import { generateUUID } from "./_lib/uuid";
import schema from "./schema";

const TABLE_NAMES = Object.keys(schema.tables) as (keyof typeof schema.tables)[];
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const APP_URL = process.env.APP_URL ?? "https://shiftori.app";
const magicLinkPurposeValidator = v.union(v.literal("submit"), v.literal("view"));

type MagicLinkPurpose = "submit" | "view";
type TestCtx = QueryCtx | MutationCtx;

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
  },
  handler: async (ctx, args) => {
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
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
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
      expiresAt: Date.now() + TWENTY_FOUR_HOURS_MS,
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

    const token = generateUUID();
    await ctx.db.insert("lineLinkTokens", {
      staffId: staff._id,
      shopId: staff.shopId,
      token,
      expiresAt: Date.now() + SEVENTY_TWO_HOURS_MS,
    });

    return { token, staffId: staff._id };
  },
});
