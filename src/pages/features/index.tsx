import { Box, Container, Link } from "@chakra-ui/react";
import { BenefitsSection, FeatureSection, FooterSection, Nav } from "@/src/components/features/LandingPage";

export function FeaturesPage() {
  return (
    <Box bg="white" minH="100vh" color="fg">
      <Nav showLinks={false} showLogin={false} compact />
      <Box as="main" pt={12}>
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
