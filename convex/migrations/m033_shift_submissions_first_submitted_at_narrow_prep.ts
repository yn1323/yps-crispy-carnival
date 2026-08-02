import { migrations } from "./index";

/** firstSubmittedAt導入前の提出は、当時唯一保存していたsubmittedAtを初回日時として補完する。 */
export const migration = migrations.define({
  table: "shiftSubmissions",
  migrateOne: async (_ctx, submission) => {
    if (submission.firstSubmittedAt !== undefined) return;
    return { firstSubmittedAt: submission.submittedAt };
  },
});
