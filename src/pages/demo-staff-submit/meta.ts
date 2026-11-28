import { buildMeta } from "@/src/lib/seo";

export function buildDemoStaffSubmitPageHead() {
  return { meta: buildMeta({ title: "スタッフの提出画面（体験デモ）", noindex: true }) };
}
