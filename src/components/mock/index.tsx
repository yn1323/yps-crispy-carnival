import { Box } from "@chakra-ui/react";
import { BenefitsSection } from "./BenefitsSection";
import { CtaSection } from "./CtaSection";
import { FaqSection } from "./FaqSection";
import { FeatureSection } from "./FeatureSection";
import { HeroSection } from "./HeroSection";
import { ProblemSection } from "./ProblemSection";

export const LandingPageMock = () => (
  <Box bg="white" color="fg">
    <HeroSection />
    <ProblemSection />
    <FeatureSection />
    <BenefitsSection />
    <CtaSection />
    <FaqSection />
  </Box>
);

export { BenefitsSection, CtaSection, FaqSection, FeatureSection, HeroSection, ProblemSection };
