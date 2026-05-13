import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getLegalConsentVersions, type LegalConsentMethod } from "./documents";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

type RecordStaffConsentArgs = {
  staffId: Id<"staffs">;
  shopId: Id<"shops">;
  method: LegalConsentMethod;
  sourceRecruitmentId?: Id<"recruitments">;
};

type LegalConsentVersionSnapshot = {
  termsConsentVersion: string;
  privacyConsentVersion: string;
  termsDocumentVersion: string;
  privacyDocumentVersion: string;
};

type RecordStaffConsentSnapshotArgs = RecordStaffConsentArgs & {
  versions: LegalConsentVersionSnapshot;
  consentedAt: number;
};

type RecordUserConsentArgs = {
  userId: Id<"users">;
  shopId: Id<"shops">;
  method: LegalConsentMethod;
};

export async function recordStaffLegalConsent(ctx: MutationCtx, args: RecordStaffConsentArgs) {
  const now = Date.now();
  const versions = getLegalConsentVersions("staff");
  return await recordStaffLegalConsentSnapshot(ctx, { ...args, versions, consentedAt: now });
}

export async function recordStaffLegalConsentSnapshot(ctx: MutationCtx, args: RecordStaffConsentSnapshotArgs) {
  const existingState = await ctx.db
    .query("legalConsentStates")
    .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
    .first();
  const statePayload = {
    subjectType: "staff" as const,
    staffId: args.staffId,
    shopId: args.shopId,
    ...args.versions,
    consentedAt: args.consentedAt,
    method: args.method,
  };
  if (existingState) {
    await ctx.db.patch(existingState._id, statePayload);
  } else {
    await ctx.db.insert("legalConsentStates", statePayload);
  }
  await ctx.db.insert("legalConsentEvents", {
    subjectType: "staff",
    staffId: args.staffId,
    shopId: args.shopId,
    ...args.versions,
    consentedAt: args.consentedAt,
    method: args.method,
    sourceRecruitmentId: args.sourceRecruitmentId,
  });
  return statePayload;
}

export async function recordUserLegalConsent(ctx: MutationCtx, args: RecordUserConsentArgs) {
  const now = Date.now();
  const versions = getLegalConsentVersions("manager");
  const existingState = await ctx.db
    .query("legalConsentStates")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .first();
  const statePayload = {
    subjectType: "user" as const,
    userId: args.userId,
    shopId: args.shopId,
    ...versions,
    consentedAt: now,
    method: args.method,
  };
  if (existingState) {
    await ctx.db.patch(existingState._id, statePayload);
  } else {
    await ctx.db.insert("legalConsentStates", statePayload);
  }
  await ctx.db.insert("legalConsentEvents", {
    subjectType: "user",
    userId: args.userId,
    shopId: args.shopId,
    ...versions,
    consentedAt: now,
    method: args.method,
  });

  return statePayload;
}

export async function getStaffLegalConsentState(ctx: DbCtx, staffId: Id<"staffs">) {
  return await ctx.db
    .query("legalConsentStates")
    .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
    .first();
}

export async function getUserLegalConsentState(ctx: DbCtx, userId: Id<"users">) {
  return await ctx.db
    .query("legalConsentStates")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

export async function hasCurrentStaffLegalConsent(ctx: DbCtx, staffId: Id<"staffs">) {
  const state = await getStaffLegalConsentState(ctx, staffId);
  const current = getLegalConsentVersions("staff");
  return (
    state?.termsConsentVersion === current.termsConsentVersion &&
    state?.privacyConsentVersion === current.privacyConsentVersion
  );
}

export async function hasCurrentUserLegalConsent(ctx: DbCtx, userId: Id<"users">) {
  const state = await getUserLegalConsentState(ctx, userId);
  const current = getLegalConsentVersions("manager");
  return (
    state?.termsConsentVersion === current.termsConsentVersion &&
    state?.privacyConsentVersion === current.privacyConsentVersion
  );
}
