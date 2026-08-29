import { getGuideMeta } from "@/src/components/features/HelpCenter/helpMeta";
import { getHelpTask, getHelpTaskHref } from "@/src/components/features/HelpCenter/helpTasks";
import { buildLinks, buildMeta, jsonLdMeta, SITE_URL } from "@/src/lib/seo";

export function buildHelpGuidePageHead(slug: string) {
  const guide = getGuideMeta(slug);

  if (!guide) {
    return {
      meta: buildMeta({ title: "ヘルプが見つかりません", noindex: true }),
    };
  }

  const task = getHelpTask(guide.task);

  return {
    links: buildLinks({ canonical: guide.href }),
    meta: [
      ...buildMeta({
        title: `${guide.title}｜ヘルプ`,
        description: guide.summary,
        canonical: guide.href,
      }),
      ...jsonLdMeta({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "ヘルプ",
            item: `${SITE_URL}/help`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: task?.title ?? "やりたいこと",
            item: task ? `${SITE_URL}${getHelpTaskHref(task.id)}` : `${SITE_URL}/help`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: guide.title,
          },
        ],
      }),
    ],
  };
}
