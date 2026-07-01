import { Box } from "@chakra-ui/react";
import { BottomCtaSection } from "./BottomCtaSection";
import { ComparisonSection } from "./ComparisonSection";
import { FaqArticlesSection } from "./FaqArticlesSection";
import { FlowSection } from "./FlowSection";
import { FooterSection } from "./FooterSection";
import { HeroSection } from "./HeroSection";
import { PricingSection } from "./PricingSection";
import { ReliefSection } from "./ReliefSection";
import { SubmissionTypesSection } from "./SubmissionTypesSection";
import { UseCasesSection } from "./UseCasesSection";

export const NewLandingPage = () => (
  <Box bg="white" color="gray.950">
    <HeroSection />
    <ReliefSection />
    <FlowSection />
    <SubmissionTypesSection />
    <ComparisonSection />
    <UseCasesSection />
    <PricingSection />
    <FaqArticlesSection />
    <BottomCtaSection />
    <FooterSection />
  </Box>
);

export {
  BottomCtaSection,
  ComparisonSection,
  FaqArticlesSection,
  FlowSection,
  FooterSection,
  HeroSection,
  PricingSection,
  ReliefSection,
  SubmissionTypesSection,
  UseCasesSection,
};
