import { Container, Link } from "@chakra-ui/react";
import { FaqSection } from "@/src/components/features/FaqSection";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";

export function FaqPage() {
  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <Container maxW="6xl" pt={{ base: 4, md: 6 }} pb={{ base: 6, md: 8 }}>
        <Link href="/" color="teal.700" textStyle="sm" fontWeight="bold" _hover={{ opacity: 0.8 }}>
          ← TOPへ
        </Link>
      </Container>
      <FaqSection headingAs="h1" />
    </PublicPageLayout>
  );
}
