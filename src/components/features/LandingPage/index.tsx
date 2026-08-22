import { OrganizationManagementSection } from "@/src/components/features/OrganizationManagementSection";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import type { PublicPlanPriceCatalog } from "@/src/domains/publicPricing";
import { BottomCtaSection } from "./BottomCtaSection";
import { ComparisonSection } from "./ComparisonSection";
import { FaqArticlesSection } from "./FaqArticlesSection";
import { FlowSection } from "./FlowSection";
import { HeroSection } from "./HeroSection";
import { PricingSection } from "./PricingSection";
import { ReliefSection } from "./ReliefSection";
import { SubmissionTypesSection } from "./SubmissionTypesSection";
import { UseCasesSection } from "./UseCasesSection";

type LandingPageProps = {
  prices: PublicPlanPriceCatalog;
};

export const LandingPage = ({ prices }: LandingPageProps) => (
  <PublicPageLayout color="gray.950" headerProps={{ position: "sticky" }}>
    <HeroSection />
    <ReliefSection />
    <FlowSection />
    <SubmissionTypesSection />
    <ComparisonSection />
    <UseCasesSection />
    <OrganizationManagementSection />
    <PricingSection prices={prices} />
    <BottomCtaSection />
    <FaqArticlesSection />
  </PublicPageLayout>
);
