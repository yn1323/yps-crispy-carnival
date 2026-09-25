import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import type { PublicPlanPriceCatalog } from "@/src/domains/publicPricing";
import { BottomCtaSection } from "./BottomCtaSection";
import { FaqArticlesSection } from "./FaqArticlesSection";
import { FeaturesOverviewSection } from "./FeaturesOverviewSection";
import { HeroSection } from "./HeroSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { IntroVideoSection } from "./IntroVideoSection";
import { MidCtaSection } from "./MidCtaSection";
import { PricingSection } from "./PricingSection";
import { ProblemSection } from "./ProblemSection";
import { StaffSubmissionSection } from "./StaffSubmissionSection";

type LandingPageProps = {
  prices: PublicPlanPriceCatalog;
};

// 課題、毎月の流れ、スタッフ側、機能の詳細、料金の順に、検討の進み方に合わせて並べる。
// 毎月の流れを読み終えたところで登録できるよう、流れの直後に小さい登録sectionを置く。
export const LandingPage = ({ prices }: LandingPageProps) => (
  <PublicPageLayout color="gray.950" headerProps={{ position: "sticky" }}>
    <HeroSection />
    <IntroVideoSection />
    <ProblemSection />
    <HowItWorksSection />
    <MidCtaSection />
    <StaffSubmissionSection />
    <FeaturesOverviewSection />
    <PricingSection prices={prices} />
    <FaqArticlesSection />
    <BottomCtaSection />
  </PublicPageLayout>
);
