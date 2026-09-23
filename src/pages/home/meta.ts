import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { createLandingFaqPageJsonLd } from "@/src/components/features/LandingPage/faqs";
import { publicPlanPrices } from "@/src/configs/publicPlanPrices";
import { formatPublicPlanStartingPrice } from "@/src/domains/publicPricing";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

const freeLimits = ORGANIZATION_PLAN_LIMITS.free;

export function buildHomePageHead() {
  return {
    links: buildLinks({ canonical: "/" }),
    meta: [
      ...buildMeta({
        // 画面の用語は「希望シフト」だが、検索では「シフト希望」の語順が使われるためtitleだけ合わせる。
        title: "LINEでシフト希望を集める無料から使えるシフト管理｜シフトリ",
        description: `LINEやメールのリンクから、スタッフはアプリ登録なしで希望シフトを提出できます。\n2か月の無料トライアル後も、${freeLimits.maxPeople}名・${freeLimits.maxShops}店舗・管理者${freeLimits.maxActiveManagers}名まではFreeプランで無料で使い続けられます。有料プランは${formatPublicPlanStartingPrice(publicPlanPrices)}です。`,
        canonical: "/",
      }),
      ...jsonLdMeta(createLandingFaqPageJsonLd()),
    ],
  };
}
