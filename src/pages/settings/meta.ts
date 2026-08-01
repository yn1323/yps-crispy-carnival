import { buildMeta } from "@/src/lib/seo";

export function buildOrganizationSettingsPageHead() {
  return { meta: buildMeta({ title: "グループ設定", noindex: true }) };
}
