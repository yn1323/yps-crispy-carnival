import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { managerMutation } from "../_lib/functions";
import { STAFF_DUPLICATE_SCAN_LIMIT } from "../constants";

export const addStaffs = managerMutation({
  args: {
    entries: v.array(v.object({ name: v.string(), email: v.string() })),
  },
  handler: async (ctx, args) => {
    const validEntries = args.entries
      .map((entry) => ({ name: entry.name.trim(), email: entry.email.trim().toLowerCase() }))
      .filter((e) => e.name !== "");

    const existingStaffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId", (q) => q.eq("shopId", ctx.shop._id))
      .take(STAFF_DUPLICATE_SCAN_LIMIT);
    // email 未入力スタッフは同姓同名でも別人として登録できる業務前提。
    // 重複防止は連絡先として一意に扱える email のみで行う。
    const existingEmails = new Set(
      existingStaffs.filter((s) => !s.isDeleted && s.email).map((s) => s.email.trim().toLowerCase()),
    );
    const insertedEmails = new Set<string>();

    const inserted: Id<"staffs">[] = [];
    for (const entry of validEntries) {
      if (entry.email && (existingEmails.has(entry.email) || insertedEmails.has(entry.email))) continue;
      const id = await ctx.db.insert("staffs", {
        shopId: ctx.shop._id,
        name: entry.name,
        email: entry.email,
        isDeleted: false,
      });
      inserted.push(id);
      if (entry.email) insertedEmails.add(entry.email);
    }
    for (const staffId of inserted) {
      // スタッフ追加直後に必要な案内をまとめて fire-and-forget する。
      // mutation は登録完了を優先し、外部送信の失敗や dry-run 判定は action 側で扱う。
      await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentEmail, {
        staffId,
      });
      await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
        staffId,
      });
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaff, {
        staffId,
      });
    }
    return inserted;
  },
});

export const editStaff = managerMutation({
  args: {
    staffId: v.id("staffs"),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
      throw new ConvexError("Not found");
    }

    const trimmedEmail = args.email.trim().toLowerCase();
    if (trimmedEmail !== "") {
      const duplicate = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_email_isDeleted", (q) =>
          q.eq("shopId", ctx.shop._id).eq("email", trimmedEmail).eq("isDeleted", false),
        )
        .first();
      if (duplicate && duplicate._id !== args.staffId) {
        throw new ConvexError("このメールアドレスは既に使用されています");
      }
    }

    const trimmedName = args.name.trim();
    const patches = [ctx.db.patch(args.staffId, { name: trimmedName, email: trimmedEmail })];
    if (staff.userId === ctx.user._id) {
      // owner 自身をスタッフとして持つ店舗では、スタッフ名と管理者名を同じ表示名として同期する。
      patches.push(ctx.db.patch(ctx.user._id, { name: trimmedName, email: trimmedEmail }));
    }
    await Promise.all(patches);
  },
});

export const deleteStaff = managerMutation({
  args: {
    staffId: v.id("staffs"),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
      throw new ConvexError("Not found");
    }

    if (staff.userId === ctx.user._id) {
      throw new ConvexError("自分のアカウントは削除できません");
    }

    await ctx.db.patch(args.staffId, { isDeleted: true });
  },
});
