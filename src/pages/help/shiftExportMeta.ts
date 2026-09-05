import { SHIFT_EXPORT_HELP } from "@/src/components/features/HelpCenter/shiftExportHelp";
import { buildLinks, buildMeta, jsonLdMeta, SITE_URL } from "@/src/lib/seo";

export function buildHelpShiftExportPageHead() {
  return {
    links: buildLinks({ canonical: SHIFT_EXPORT_HELP.href }),
    meta: [
      ...buildMeta({
        title: `${SHIFT_EXPORT_HELP.title}｜ヘルプ・使い方`,
        description: SHIFT_EXPORT_HELP.description,
        canonical: SHIFT_EXPORT_HELP.href,
      }),
      ...jsonLdMeta({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "ヘルプ・使い方",
            item: `${SITE_URL}/help`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: SHIFT_EXPORT_HELP.title,
          },
        ],
      }),
    ],
  };
}
