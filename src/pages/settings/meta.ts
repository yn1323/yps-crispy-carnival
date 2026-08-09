import { buildMeta } from "@/src/lib/seo";

export function buildOrganizationSettingsPageHead() {
  return { meta: buildMeta({ title: "組織設定", noindex: true }) };
}
