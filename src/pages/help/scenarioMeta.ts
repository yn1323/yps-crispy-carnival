import { SHIFT_MANAGEMENT_SCENARIO } from "@/src/components/features/HelpCenter/helpScenario";
import { buildLinks, buildMeta, jsonLdMeta, SITE_URL } from "@/src/lib/seo";

export function buildHelpShiftManagementScenarioPageHead() {
  return {
    links: buildLinks({ canonical: SHIFT_MANAGEMENT_SCENARIO.href }),
    meta: [
      ...buildMeta({
        title: `${SHIFT_MANAGEMENT_SCENARIO.title}｜ヘルプ・使い方`,
        description: SHIFT_MANAGEMENT_SCENARIO.description,
        canonical: SHIFT_MANAGEMENT_SCENARIO.href,
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
            name: SHIFT_MANAGEMENT_SCENARIO.title,
          },
        ],
      }),
    ],
  };
}
