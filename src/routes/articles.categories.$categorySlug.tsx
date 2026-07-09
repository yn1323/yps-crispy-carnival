import { createFileRoute } from "@tanstack/react-router";
import { ArticleCategoryPage } from "@/src/components/features/ArticleSite";
import { createCategoryBreadcrumbJsonLd, getCategoryMeta } from "@/src/components/features/ArticleSite/articleMeta";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/articles/categories/$categorySlug")({
  head: ({ params }) => {
    const category = getCategoryMeta(params.categorySlug);

    if (!category) {
      return {
        meta: buildMeta({ title: "カテゴリが見つかりません", noindex: true }),
      };
    }

    const canonical = `/articles/categories/${category.slug}`;
    return {
      links: buildLinks({ canonical }),
      meta: [
        ...buildMeta({
          title: `${category.title}｜シフト作成ガイド`,
          description: category.description,
          canonical,
        }),
        ...jsonLdMeta(createCategoryBreadcrumbJsonLd(category)),
      ],
    };
  },
  component: ArticleCategoryRoute,
});

function ArticleCategoryRoute() {
  const { categorySlug } = Route.useParams();
  return <ArticleCategoryPage categorySlug={categorySlug} />;
}
