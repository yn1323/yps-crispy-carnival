import { Box, Container } from "@chakra-ui/react";
import { BottomCtaSection } from "./BottomCtaSection";
import { ComparisonSection } from "./ComparisonSection";
import { FaqArticlesSection } from "./FaqArticlesSection";
import { FlowSection } from "./FlowSection";
import { FooterSection } from "./FooterSection";
import { HeroSection, LandingHeader } from "./HeroSection";
import { PricingSection } from "./PricingSection";
import { ReliefSection } from "./ReliefSection";
import { SubmissionTypesSection } from "./SubmissionTypesSection";
import { UseCasesSection } from "./UseCasesSection";

export const NewLandingPage = () => (
  <Box bg="white" color="gray.950">
    <Box as="header" position="sticky" top={0} zIndex="sticky" bg="whiteAlpha.950" backdropFilter="blur(14px)">
      <Container maxW="7xl" py={{ base: 4, md: 5 }}>
        <LandingHeader />
      </Container>
    </Box>
    <HeroSection />
    <ReliefSection />
    <FlowSection />
    <SubmissionTypesSection />
    <ComparisonSection />
    <UseCasesSection />
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
