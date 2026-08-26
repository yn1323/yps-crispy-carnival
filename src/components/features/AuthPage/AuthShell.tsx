import { Box, Card, Container, Grid, Heading, Image, Stack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { HEADER_HEIGHT, Header } from "@/src/components/templates/Header";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";
import loginIllustration from "./login.webp";

type AuthShellProps = {
  children: ReactNode;
  description?: string;
  isInitialLoading?: boolean;
  title: string;
};

export function AuthShell({ children, description, isInitialLoading, title }: AuthShellProps) {
  return (
    <Box minH="100dvh" bgGradient="to-b" gradientFrom="#E6F7F5" gradientVia="#F3FBFA" gradientTo="white">
      <Header variant="public" showLinks={false} showLogin={false} />
      <Container
        as="main"
        maxW="7xl"
        minH="100dvh"
        display="flex"
        alignItems="center"
        px={{ base: 4, md: 8 }}
        pt={HEADER_HEIGHT}
        pb={0}
      >
        <Grid
          w="full"
          mt={0}
          templateColumns={{ base: "1fr", lg: "minmax(0, 1.1fr) minmax(420px, 0.9fr)" }}
          gap={{ base: 7, lg: 12 }}
          alignItems="center"
        >
          <AuthIllustrationPanel />
          <Card.Root
            w="full"
            maxW={{ base: "640px", lg: "none" }}
            mx={{ base: "auto", lg: 0 }}
            borderWidth={0}
            shadow="xl"
            borderRadius="2xl"
            overflow="hidden"
          >
            <Card.Body p={{ base: 6, md: 8 }}>
              <VStack align="stretch" gap={8}>
                <Stack gap={2}>
                  <Heading as="h1" size={{ base: "xl", md: "2xl" }} color="gray.950">
                    {title}
                  </Heading>
                  {description && (
                    <Text color="gray.700" textStyle="bodySm" lineHeight="1.8">
                      {description}
                    </Text>
                  )}
                </Stack>
                {isInitialLoading ? (
                  <ShiftoriLoading
                    variant="section"
                    aria-label="認証情報を確認中"
                    minH={{ base: "340px", md: "360px" }}
                  />
                ) : (
                  children
                )}
              </VStack>
            </Card.Body>
          </Card.Root>
        </Grid>
      </Container>
    </Box>
  );
}

const AuthIllustrationPanel = () => (
  <Box display={{ base: "none", lg: "block" }}>
    <VStack align="stretch">
      <Box maxW={{ base: "320px", md: "640px", lg: "720px" }} mx={{ base: "auto", lg: 0 }}>
        <Box borderRadius="2xl" overflow="hidden">
          <Image
            src={loginIllustration}
            alt="シフト作成の画面イメージ"
            w="full"
            style={{
              WebkitMaskImage: "radial-gradient(ellipse at center, #000 58%, rgba(0, 0, 0, 0.9) 70%, transparent 100%)",
              maskImage: "radial-gradient(ellipse at center, #000 58%, rgba(0, 0, 0, 0.9) 70%, transparent 100%)",
            }}
          />
        </Box>
      </Box>
    </VStack>
  </Box>
);
