import { createFileRoute } from "@tanstack/react-router";
import { ArticleCategoryPage } from "@/src/pages/articles";
import { buildArticleCategoryPageHead } from "@/src/pages/articles/meta";

export const Route = createFileRoute("/articles/categories/$categorySlug")({
  head: ({ params }) => buildArticleCategoryPageHead(params.categorySlug),
  component: ArticleCategoryRoute,
});

function ArticleCategoryRoute() {
  const { categorySlug } = Route.useParams();
  return <ArticleCategoryPage categorySlug={categorySlug} />;
}
