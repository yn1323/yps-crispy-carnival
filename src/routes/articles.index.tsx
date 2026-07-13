import { createFileRoute } from "@tanstack/react-router";
import { ArticleListPage } from "@/src/pages/articles";
import { buildArticleListPageHead } from "@/src/pages/articles/meta";

export const Route = createFileRoute("/articles/")({
  head: buildArticleListPageHead,
  component: ArticleListPage,
});
