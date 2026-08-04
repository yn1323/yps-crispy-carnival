import { buildMeta } from "@/src/lib/seo";

export function buildAccountSecurityPageHead() {
  return { meta: buildMeta({ title: "ログイン方法とセキュリティ", noindex: true }) };
}
