import { Box } from "@chakra-ui/react";
import { ArticlePreviewSection } from "./ArticlePreviewSection";
import { BenefitsSection } from "./BenefitsSection";
import { CtaSection } from "./CtaSection";
import { FaqSection } from "./FaqSection";
import { FeatureSection } from "./FeatureSection";
import { FooterSection } from "./FooterSection";
import { HeroSection } from "./HeroSection";
import { ProblemSection } from "./ProblemSection";
import { SubmissionMethodsSection } from "./SubmissionMethodsSection";

export const LandingPage = () => (
  <Box bg="white" color="fg">
    <HeroSection />
    <ProblemSection />
    <FeatureSection />
    <SubmissionMethodsSection />
    <BenefitsSection />
    <CtaSection />
    {/* モック段階のためLP本体では非表示 */}
    {/* <ArticlePreviewSection /> */}
    <FaqSection />
    <FooterSection />
  </Box>
);

export {
  ArticlePreviewSection,
  BenefitsSection,
  CtaSection,
  FaqSection,
  FeatureSection,
  FooterSection,
  FooterSection as Footer,
  HeroSection,
  ProblemSection,
  SubmissionMethodsSection,
};
