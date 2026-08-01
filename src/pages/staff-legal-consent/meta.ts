import { buildMeta } from "@/src/lib/seo";

export function buildStaffLegalConsentPageHead() {
  return { meta: buildMeta({ title: "規約の確認", noindex: true }) };
}
