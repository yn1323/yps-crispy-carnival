import { Box, Container, Link } from "@chakra-ui/react";
import { FaqSection, FooterSection, Nav } from "@/src/components/features/LandingPage";

export function FaqPage() {
  return (
    <Box bg="white" minH="100vh" color="fg">
      <Nav showLinks={false} showLogin={false} compact />
      <Box as="main" pt={12}>
        <Container maxW="6xl" pt={{ base: 4, md: 6 }} pb={{ base: 6, md: 8 }}>
          <Link href="/" color="teal.700" textStyle="sm" fontWeight="bold" _hover={{ opacity: 0.8 }}>
            ← TOPへ
          </Link>
        </Container>
        <FaqSection headingAs="h1" />
      </Box>
      <FooterSection />
    </Box>
  );
}
