import { buildMeta } from "@/src/lib/seo";

export function buildStaffRegistrationPageHead() {
  return { meta: buildMeta({ title: "スタッフ登録", noindex: true }) };
}
