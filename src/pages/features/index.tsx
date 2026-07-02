import { Box, Container, Link } from "@chakra-ui/react";
import { BenefitsSection } from "@/src/components/features/LandingPage/BenefitsSection";
import { FeatureSection } from "@/src/components/features/LandingPage/FeatureSection";
import { FooterSection } from "@/src/components/features/LandingPage/FooterSection";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";

export function FeaturesPage() {
  return (
    <Box bg="white" minH="100vh" color="fg">
      <Header variant="public" showLinks={false} showLogin={false} />
      <Box as="main" pt={HEADER_HEIGHT}>
        <Container maxW="7xl" pt={{ base: 4, md: 6 }} pb={{ base: 6, md: 8 }}>
          <Link href="/" color="teal.700" textStyle="sm" fontWeight="bold" _hover={{ opacity: 0.8 }}>
            ← TOPへ
          </Link>
        </Container>
        <FeatureSection headingAs="h1" />
        <BenefitsSection />
      </Box>
      <FooterSection />
    </Box>
  );
}
