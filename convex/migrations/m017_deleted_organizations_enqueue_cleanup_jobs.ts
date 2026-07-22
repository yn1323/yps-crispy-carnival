import { ensureDeletionCleanupJob } from "../deletionCleanup/service";
import { migrations } from "./index";

/** 既存の削除済み組織へ、決定的なkeyで全scope cleanup jobを一件だけ作る。 */
export const migration = migrations.define({
  table: "organizations",
  batchSize: 50,
  migrateOne: async (ctx, organization) => {
    if (!organization.isDeleted) return;
    await ensureDeletionCleanupJob(ctx, {
      scope: "organization",
      organizationId: organization._id,
      requestId: `migration:m017:${organization._id}`,
    });
  },
});
