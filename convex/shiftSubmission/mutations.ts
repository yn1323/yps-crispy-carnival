import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getDeadlineCutoff } from "../_lib/dateFormat";
import { staffSessionMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { timeToMinutes } from "../_lib/time";
import { hasCurrentStaffLegalConsent, recordStaffLegalConsent } from "../legal/service";
import { submitShiftRequestsSchema } from "./schemas";

/**
 * シフト希望を提出（新規 or 修正）
 * requests が空配列 = 全日休み提出
 */
export const submitShiftRequests = staffSessionMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    acceptedLegal: v.optional(v.boolean()),
    requests: v.array(
      v.object({
        date: v.string(),
        startTime: v.string(),
        endTime: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const rateLimitResult = await rateLimit(ctx, {
      name: "submitShiftRequests",
      key: ctx.staff._id,
    });
    if (!rateLimitResult.ok) {
      throw new ConvexError({ code: "RATE_LIMITED", retryAfter: rateLimitResult.retryAt });
    }

    if (ctx.session.recruitmentId !== args.recruitmentId) {
      throw new ConvexError("Not found");
    }

    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }
    if (recruitment.status !== "open") {
      throw new ConvexError("Not found");
    }

    // 締切日は終日有効。翌日 0:00 を cutoff にして、表示上の「締切日」と提出可否を揃える。
    if (Date.now() >= getDeadlineCutoff(recruitment.deadline)) {
      throw new ConvexError("Deadline passed");
    }

    const parsed = submitShiftRequestsSchema.safeParse({ requests: args.requests });
    if (!parsed.success) {
      throw new ConvexError("Invalid request data");
    }

    if (!(await hasCurrentStaffLegalConsent(ctx, ctx.staff._id))) {
      if (args.acceptedLegal !== true) {
        throw new ConvexError("Legal consent required");
      }
      // スタッフは Clerk アカウントを持たないため、初回提出の同意を staff ドキュメントへ直接記録する。
      await recordStaffLegalConsent(ctx, {
        staffId: ctx.staff._id,
        shopId: ctx.shop._id,
        method: "shift_submit",
        sourceRecruitmentId: args.recruitmentId,
      });
    }

    const requestedDates = new Set<string>();
    const shopClosedDateSet = new Set(recruitment.shopClosedDates ?? []);
    for (const req of args.requests) {
      if (requestedDates.has(req.date)) {
        throw new ConvexError("同じ日の希望シフトは1件だけ登録できます");
      }
      requestedDates.add(req.date);

      if (req.date < recruitment.periodStart || req.date > recruitment.periodEnd) {
        throw new ConvexError("Date out of range");
      }
      if (shopClosedDateSet.has(req.date)) {
        throw new ConvexError("定休日には希望シフトを提出できません");
      }
      if (timeToMinutes(req.startTime) >= timeToMinutes(req.endTime)) {
        throw new ConvexError("Invalid time range");
      }
      const shiftStartTime = recruitment.shiftStartTime;
      const shiftEndTime = recruitment.shiftEndTime;
      if (
        timeToMinutes(req.startTime) < timeToMinutes(shiftStartTime) ||
        timeToMinutes(req.endTime) > timeToMinutes(shiftEndTime)
      ) {
        throw new ConvexError("Invalid time range");
      }
    }

    const now = Date.now();
    const existingSubmission = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .first();
    const existingSlots = await ctx.db
      .query("shiftSubmissionSlots")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .collect();

    // 再提出は差分更新ではなく全置換。休みの日は明細を作らないため、
    // shiftSubmissions 側の存在が「提出済み」の正になる。
    await Promise.all(existingSlots.map((r) => ctx.db.delete(r._id)));

    let submissionId: Id<"shiftSubmissions">;
    if (existingSubmission) {
      await ctx.db.patch(existingSubmission._id, {
        // 既存データは firstSubmittedAt がないため、再提出直前の submittedAt を初回扱いにする。
        firstSubmittedAt: existingSubmission.firstSubmittedAt ?? existingSubmission.submittedAt,
        submittedAt: now,
      });
      submissionId = existingSubmission._id;
    } else {
      submissionId = await ctx.db.insert("shiftSubmissions", {
        recruitmentId: args.recruitmentId,
        staffId: ctx.staff._id,
        firstSubmittedAt: now,
        submittedAt: now,
      });
    }

    await Promise.all([
      ...args.requests.map((r) =>
        ctx.db.insert("shiftSubmissionSlots", {
          submissionId,
          recruitmentId: args.recruitmentId,
          staffId: ctx.staff._id,
          date: r.date,
          startTime: r.startTime,
          endTime: r.endTime,
        }),
      ),
    ]);

    const stats = await ctx.db
      .query("recruitmentStats")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .first();
    if (stats) {
      await ctx.db.patch(stats._id, {
        submittedCount: existingSubmission ? stats.submittedCount : stats.submittedCount + 1,
        updatedAt: now,
      });
    } else {
      const submissions = await ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .collect();
      const activeStaffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ctx.shop._id).eq("isDeleted", false))
        .collect();
      await ctx.db.insert("recruitmentStats", {
        recruitmentId: args.recruitmentId,
        shopId: ctx.shop._id,
        submittedCount: submissions.length,
        activeStaffCountSnapshot: activeStaffs.length,
        updatedAt: now,
      });
    }
  },
});
