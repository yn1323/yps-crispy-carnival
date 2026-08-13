import { buildMeta } from "@/src/lib/seo";

export function buildManagerSettingsPageHead() {
  return { meta: buildMeta({ title: "管理者設定", noindex: true }) };
}
