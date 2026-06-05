import { createFileRoute } from "@tanstack/react-router";
import { ArticleCategoryPage } from "@/src/components/mock/ArticleSite";
import { getCategory } from "@/src/components/mock/ArticleSite/articleContent";
import { buildLinks, buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/articles/categories/$categorySlug")({
  head: ({ params }) => {
    const category = getCategory(params.categorySlug);

    if (!category) {
      return {
        meta: buildMeta({ title: "カテゴリが見つかりません", noindex: true }),
      };
    }

    const canonical = `/articles/categories/${category.meta.slug}`;
    return {
      links: buildLinks({ canonical }),
      meta: buildMeta({
        title: `${category.meta.title}｜小さなお店のシフト作成ガイド`,
        description: category.meta.description,
        canonical,
      }),
    };
  },
  component: ArticleCategoryRoute,
});

function ArticleCategoryRoute() {
  const { categorySlug } = Route.useParams();
  return <ArticleCategoryPage categorySlug={categorySlug} />;
}
