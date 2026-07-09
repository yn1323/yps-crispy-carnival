import { createFileRoute } from "@tanstack/react-router";
import { ArticlePage } from "@/src/components/features/ArticleSite";
import {
  createArticleBreadcrumbJsonLd,
  createArticleJsonLd,
  getArticleMeta,
  getArticleOgpImagePath,
} from "@/src/components/features/ArticleSite/articleMeta";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/articles/$slug")({
  head: ({ params }) => {
    const article = getArticleMeta(params.slug);

    if (!article) {
      return {
        meta: buildMeta({ title: "記事が見つかりません", noindex: true }),
      };
    }

    return {
      links: buildLinks({ canonical: article.canonicalPath }),
      meta: [
        ...buildMeta({
          title: article.ogTitle,
          description: article.ogDescription,
          canonical: article.canonicalPath,
          ogType: "article",
          ogImage: { path: getArticleOgpImagePath(article.slug), alt: article.title },
        }),
        ...jsonLdMeta(createArticleJsonLd(article)),
        ...jsonLdMeta(createArticleBreadcrumbJsonLd(article)),
      ],
    };
  },
  component: ArticleRoute,
});

function ArticleRoute() {
  const { slug } = Route.useParams();
  return <ArticlePage slug={slug} />;
}
