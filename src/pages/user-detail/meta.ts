import { buildMeta } from "@/src/lib/seo";

export function buildUserDetailPageHead() {
  return { meta: buildMeta({ title: "スタッフ詳細", noindex: true }) };
}
