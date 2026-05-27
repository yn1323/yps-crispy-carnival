import { Box } from "@chakra-ui/react";
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
    <FaqSection />
    <FooterSection />
  </Box>
);

export {
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
