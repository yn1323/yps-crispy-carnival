import { ORGANIZATION_STRUCTURE_HELP } from "@/src/components/features/HelpCenter/organizationStructureHelp";
import { buildLinks, buildMeta, jsonLdMeta, SITE_URL } from "@/src/lib/seo";

export function buildHelpOrganizationStructurePageHead() {
  return {
    links: buildLinks({ canonical: ORGANIZATION_STRUCTURE_HELP.href }),
    meta: [
      ...buildMeta({
        title: `${ORGANIZATION_STRUCTURE_HELP.title}｜ヘルプ・使い方`,
        description: ORGANIZATION_STRUCTURE_HELP.metaDescription,
        canonical: ORGANIZATION_STRUCTURE_HELP.href,
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
            name: ORGANIZATION_STRUCTURE_HELP.title,
          },
        ],
      }),
    ],
  };
}
