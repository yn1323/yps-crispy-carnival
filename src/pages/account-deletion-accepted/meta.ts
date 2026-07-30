import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildAccountDeletionAcceptedPageHead() {
  return {
    links: buildLinks({ canonical: "/account-deletion-accepted" }),
    meta: buildMeta({ title: "アカウント削除の受付完了", canonical: "/account-deletion-accepted", noindex: true }),
  };
}
