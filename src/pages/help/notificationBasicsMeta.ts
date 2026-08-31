import { NOTIFICATION_BASICS_HELP } from "@/src/components/features/HelpCenter/notificationBasicsHelp";
import { buildLinks, buildMeta, jsonLdMeta, SITE_URL } from "@/src/lib/seo";

export function buildHelpNotificationBasicsPageHead() {
  return {
    links: buildLinks({ canonical: NOTIFICATION_BASICS_HELP.href }),
    meta: [
      ...buildMeta({
        title: `${NOTIFICATION_BASICS_HELP.title}｜ヘルプ・使い方`,
        description: NOTIFICATION_BASICS_HELP.metaDescription,
        canonical: NOTIFICATION_BASICS_HELP.href,
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
            name: NOTIFICATION_BASICS_HELP.title,
          },
        ],
      }),
    ],
  };
}
