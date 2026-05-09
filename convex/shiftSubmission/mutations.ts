import { ConvexError, v } from "convex/values";
import { getDeadlineCutoff } from "../_lib/dateFormat";
import { staffSessionMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { timeToMinutes } from "../_lib/time";
import { hasCurrentLegalConsent } from "../legal/documents";
import { recordStaffLegalConsent } from "../legal/service";
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

    if (!hasCurrentLegalConsent(ctx.staff, "staff")) {
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

    for (const req of args.requests) {
      if (req.date < recruitment.periodStart || req.date > recruitment.periodEnd) {
        throw new ConvexError("Date out of range");
      }
      if (timeToMinutes(req.startTime) >= timeToMinutes(req.endTime)) {
        throw new ConvexError("Invalid time range");
      }
      // 募集作成時点の営業時間を優先し、移行中データだけ現在の店舗設定へフォールバックする。
      const shiftStartTime = recruitment.shiftStartTime ?? ctx.shop.shiftStartTime;
      const shiftEndTime = recruitment.shiftEndTime ?? ctx.shop.shiftEndTime;
      if (
        timeToMinutes(req.startTime) < timeToMinutes(shiftStartTime) ||
        timeToMinutes(req.endTime) > timeToMinutes(shiftEndTime)
      ) {
        throw new ConvexError("Invalid time range");
      }
    }

    const existingRequests = await ctx.db
      .query("shiftRequests")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .collect();
    // 再提出は差分更新ではなく全置換。休みの日は shiftRequests を作らないため、
    // shiftSubmissions 側の存在が「提出済み」の正になる。
    await Promise.all(existingRequests.map((r) => ctx.db.delete(r._id)));

    await Promise.all(
      args.requests.map((r) =>
        ctx.db.insert("shiftRequests", {
          recruitmentId: args.recruitmentId,
          staffId: ctx.staff._id,
          date: r.date,
          startTime: r.startTime,
          endTime: r.endTime,
        }),
      ),
    );

    const now = Date.now();
    const existingSubmission = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .first();
    if (existingSubmission) {
      await ctx.db.patch(existingSubmission._id, {
        // 既存データは firstSubmittedAt がないため、再提出直前の submittedAt を初回扱いにする。
        firstSubmittedAt: existingSubmission.firstSubmittedAt ?? existingSubmission.submittedAt,
        submittedAt: now,
      });
    } else {
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId: args.recruitmentId,
        staffId: ctx.staff._id,
        firstSubmittedAt: now,
        submittedAt: now,
      });
    }
  },
});
