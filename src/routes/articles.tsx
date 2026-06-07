import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ArticleListPage } from "@/src/components/features/ArticleSite";
import { sitePage } from "@/src/components/features/ArticleSite/articleContent";
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
  component: ArticlesRoute,
});

function ArticlesRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname === "/articles" || pathname === "/articles/") {
    return <ArticleListPage />;
  }

  return <Outlet />;
}
