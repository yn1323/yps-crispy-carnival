import { createFileRoute } from "@tanstack/react-router";
import { ArticlePage } from "@/src/components/features/ArticleSite";
import {
  createArticleBreadcrumbJsonLd,
  createArticleJsonLd,
  getArticle,
  getArticleOgpImagePath,
} from "@/src/components/features/ArticleSite/articleContent";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/articles/$slug")({
  head: ({ params }) => {
    const article = getArticle(params.slug);

    if (!article) {
      return {
        meta: buildMeta({ title: "記事が見つかりません", noindex: true }),
      };
    }

    return {
      links: buildLinks({ canonical: article.meta.canonicalPath }),
      meta: [
        ...buildMeta({
          title: article.meta.ogTitle,
          description: article.meta.ogDescription,
          canonical: article.meta.canonicalPath,
          ogType: "article",
          ogImage: { path: getArticleOgpImagePath(article.meta.slug), alt: article.meta.title },
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
