import { buildMeta } from "@/src/lib/seo";

export function buildUserDetailPageHead() {
  return { meta: buildMeta({ title: "ユーザー詳細", noindex: true }) };
}
