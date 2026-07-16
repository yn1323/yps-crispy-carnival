import { buildMeta } from "@/src/lib/seo";

export function buildOrganizationSettingsPageHead() {
  return { meta: buildMeta({ title: "事業者設定", noindex: true }) };
}
