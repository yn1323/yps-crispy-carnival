import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getLegalConsentVersions, type LegalConsentMethod } from "./documents";

type RecordStaffConsentArgs = {
  staffId: Id<"staffs">;
  shopId: Id<"shops">;
  method: LegalConsentMethod;
  sourceRecruitmentId?: Id<"recruitments">;
};

type RecordUserConsentArgs = {
  userId: Id<"users">;
  shopId: Id<"shops">;
  method: LegalConsentMethod;
};

export async function recordStaffLegalConsent(ctx: MutationCtx, args: RecordStaffConsentArgs) {
  const now = Date.now();
  const versions = getLegalConsentVersions("staff");
  const legalConsent = {
    legalTermsConsentVersion: versions.termsConsentVersion,
    legalPrivacyConsentVersion: versions.privacyConsentVersion,
    legalTermsDocumentVersion: versions.termsDocumentVersion,
    legalPrivacyDocumentVersion: versions.privacyDocumentVersion,
    legalConsentedAt: now,
    legalConsentMethod: args.method,
  };

  // 現在値は staff / user ドキュメントへ写し、監査用の履歴は events に追記する。
  // 画面の判定は現在値だけを読み、あとから規約バージョンの証跡を追えるように分けている。
  await ctx.db.patch(args.staffId, legalConsent);
  await ctx.db.insert("legalConsentEvents", {
    subjectType: "staff",
    staffId: args.staffId,
    shopId: args.shopId,
    ...versions,
    consentedAt: now,
    method: args.method,
    sourceRecruitmentId: args.sourceRecruitmentId,
  });

  return legalConsent;
}

export async function recordUserLegalConsent(ctx: MutationCtx, args: RecordUserConsentArgs) {
  const now = Date.now();
  const versions = getLegalConsentVersions("manager");
  const legalConsent = {
    legalTermsConsentVersion: versions.termsConsentVersion,
    legalPrivacyConsentVersion: versions.privacyConsentVersion,
    legalTermsDocumentVersion: versions.termsDocumentVersion,
    legalPrivacyDocumentVersion: versions.privacyDocumentVersion,
    legalConsentedAt: now,
    legalConsentMethod: args.method,
  };

  // manager も staff と同じ二重記録にする。再同意導線が増えても、判定と監査の責務を混ぜない。
  await ctx.db.patch(args.userId, legalConsent);
  await ctx.db.insert("legalConsentEvents", {
    subjectType: "user",
    userId: args.userId,
    shopId: args.shopId,
    ...versions,
    consentedAt: now,
    method: args.method,
  });

  return legalConsent;
}
