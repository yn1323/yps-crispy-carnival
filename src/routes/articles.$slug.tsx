import { createFileRoute } from "@tanstack/react-router";
import { ArticlePage } from "@/src/pages/articles";
import { buildArticlePageHead } from "@/src/pages/articles/meta";

export const Route = createFileRoute("/articles/$slug")({
  head: ({ params }) => buildArticlePageHead(params.slug),
  component: ArticleRoute,
});

function ArticleRoute() {
  const { slug } = Route.useParams();
  return <ArticlePage slug={slug} />;
}
