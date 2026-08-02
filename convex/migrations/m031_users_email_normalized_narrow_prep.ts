import { migrations } from "./index";

function normalizeLegacyEmail(email: string) {
  return email.trim().toLowerCase();
}

/** 旧usersへ、現行writerと同じ規則で検索用メールを補完する。 */
export const migration = migrations.define({
  table: "users",
  migrateOne: async (_ctx, user) => {
    const emailNormalized = normalizeLegacyEmail(user.email);
    if (user.emailNormalized === emailNormalized) return;
    return { emailNormalized };
  },
});
