import { Container, Link } from "@chakra-ui/react";
import { BenefitsSection } from "@/src/components/features/BenefitsSection";
import { FeatureSection } from "@/src/components/features/FeatureSection";
import { OrganizationManagementSection } from "@/src/components/features/OrganizationManagementSection";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";

export function FeaturesPage() {
  return (
    <PublicPageLayout headerProps={{ showLinks: false, showLogin: false }}>
      <Container maxW="7xl" pt={{ base: 4, md: 6 }} pb={{ base: 6, md: 8 }}>
        <Link href="/" color="teal.700" textStyle="sm" fontWeight="bold" _hover={{ opacity: 0.8 }}>
          ← TOPへ
        </Link>
      </Container>
      <FeatureSection headingAs="h1" />
      <BenefitsSection />
      <OrganizationManagementSection />
    </PublicPageLayout>
  );
}
