import { createHelpFaqPageJsonLd, faqMetas } from "@/src/components/features/HelpCenter/helpMeta";
import { getHelpTask, getHelpTaskHref } from "@/src/components/features/HelpCenter/helpTasks";
import { buildLinks, buildMeta, jsonLdMeta, SITE_URL } from "@/src/lib/seo";

export function buildHelpTaskPageHead(taskId: string) {
  const task = getHelpTask(taskId);
  if (!task) {
    return {
      meta: buildMeta({ title: "やりたいことが見つかりません", noindex: true }),
    };
  }

  const canonical = getHelpTaskHref(task.id);
  const taskFaqs = faqMetas.filter((faq) => faq.task === task.id);

  return {
    links: buildLinks({ canonical }),
    meta: [
      ...buildMeta({
        title: `${task.title}｜ヘルプ・使い方`,
        description: `${task.description} よくある質問と詳しい使い方を確認できます。`,
        canonical,
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
            name: task.title,
            item: `${SITE_URL}${canonical}`,
          },
        ],
      }),
      ...jsonLdMeta(createHelpFaqPageJsonLd(taskFaqs)),
    ],
  };
}
