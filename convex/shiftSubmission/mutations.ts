import { ConvexError, v } from "convex/values";
import { getDeadlineCutoff } from "../_lib/dateFormat";
import { staffSessionMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { timeToMinutes } from "../_lib/time";
import { submitShiftRequestsSchema } from "./schemas";

/**
 * シフト希望を提出（新規 or 修正）
 * requests が空配列 = 全日休み提出
 */
export const submitShiftRequests = staffSessionMutation({
  args: {
    recruitmentId: v.id("recruitments"),
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

    if (Date.now() >= getDeadlineCutoff(recruitment.deadline)) {
      throw new ConvexError("Deadline passed");
    }

    const parsed = submitShiftRequestsSchema.safeParse({ requests: args.requests });
    if (!parsed.success) {
      throw new ConvexError("Invalid request data");
    }

    for (const req of args.requests) {
      if (req.date < recruitment.periodStart || req.date > recruitment.periodEnd) {
        throw new ConvexError("Date out of range");
      }
      if (timeToMinutes(req.startTime) >= timeToMinutes(req.endTime)) {
        throw new ConvexError("Invalid time range");
      }
    }

    const existingRequests = await ctx.db
      .query("shiftRequests")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .collect();
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

    const existingSubmission = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId_staffId", (q) =>
        q.eq("recruitmentId", args.recruitmentId).eq("staffId", ctx.staff._id),
      )
      .first();
    if (existingSubmission) {
      await ctx.db.patch(existingSubmission._id, { submittedAt: Date.now() });
    } else {
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId: args.recruitmentId,
        staffId: ctx.staff._id,
        submittedAt: Date.now(),
      });
    }
  },
});
