import { migrations } from "./index";

function normalizeLegacyEmail(email: string) {
  return email.trim().toLowerCase();
}

/** 旧staffsへ、現行writerと同じ規則で検索用メールを補完する。 */
export const migration = migrations.define({
  table: "staffs",
  migrateOne: async (_ctx, staff) => {
    const emailNormalized = normalizeLegacyEmail(staff.email);
    if (staff.emailNormalized === emailNormalized) return;
    return { emailNormalized };
  },
});
