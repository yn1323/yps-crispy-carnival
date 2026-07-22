import { buildMeta } from "@/src/lib/seo";

export function buildAccountDeletionAcceptedPageHead() {
  return { meta: buildMeta({ title: "アカウント削除の受付完了", noindex: true }) };
}
