import { Box, Container, Stack, Text } from "@chakra-ui/react";
import { ContactForm } from "@/src/components/features/ContactForm";
import { FooterSection } from "@/src/components/features/LandingPage/FooterSection";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";

export function ContactPage() {
  return (
    <Box bg="gray.50" minH="100vh">
      <Header variant="public" showLinks={false} />
      <Box as="main" pt={HEADER_HEIGHT}>
        <Container maxW="640px" px={{ base: 4, md: 6 }} py={{ base: 8, md: 14 }}>
          <Stack gap={{ base: 6, md: 8 }}>
            <Box>
              <Text as="h1" color="gray.950" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="bold">
                お問い合わせ
              </Text>
              <Text color="fg.muted" lineHeight="tall" mt={3}>
                導入のご相談や機能についてのご質問を受け付けています。
              </Text>
            </Box>
            <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="xl" p={{ base: 5, md: 8 }}>
              <ContactForm />
            </Box>
          </Stack>
        </Container>
      </Box>
      <FooterSection />
    </Box>
  );
}
