import { Box, Container, Link } from "@chakra-ui/react";
import { FaqSection } from "@/src/components/features/LandingPage/FaqSection";
import { FooterSection } from "@/src/components/features/NewLandingPage/FooterSection";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";

export function FaqPage() {
  return (
    <Box bg="white" minH="100vh" color="fg">
      <Header variant="public" showLinks={false} showLogin={false} />
      <Box as="main" pt={HEADER_HEIGHT}>
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
