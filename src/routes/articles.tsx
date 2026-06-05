import { createFileRoute } from "@tanstack/react-router";
import { ArticleListPage } from "@/src/components/mock/ArticleSite";
import { sitePage } from "@/src/components/mock/ArticleSite/articleContent";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/articles")({
  head: () => ({
    links: buildLinks({ canonical: "/articles" }),
    meta: buildMeta({
      title: sitePage.title,
      description: sitePage.description,
      canonical: "/articles",
    }),
  }),
  component: ArticleListPage,
});
