import { OrganizationManagementSection } from "@/src/components/features/OrganizationManagementSection";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { BottomCtaSection } from "./BottomCtaSection";
import { ComparisonSection } from "./ComparisonSection";
import { FaqArticlesSection } from "./FaqArticlesSection";
import { FlowSection } from "./FlowSection";
import { HeroSection } from "./HeroSection";
import { ReliefSection } from "./ReliefSection";
import { SubmissionTypesSection } from "./SubmissionTypesSection";
import { UseCasesSection } from "./UseCasesSection";

export const LandingPage = () => (
  <PublicPageLayout color="gray.950" headerProps={{ position: "sticky" }}>
    <HeroSection />
    <ReliefSection />
    <FlowSection />
    <SubmissionTypesSection />
    <ComparisonSection />
    <UseCasesSection />
    <OrganizationManagementSection />
    <FaqArticlesSection />
    <BottomCtaSection />
  </PublicPageLayout>
);
