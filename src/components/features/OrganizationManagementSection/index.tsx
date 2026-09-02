import { Box, Container, Flex, Grid, Heading, Icon, Image, Stack, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuStore, LuUsersRound } from "react-icons/lu";
import managersImage from "./managers.webp";

const managementFeatures: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuStore,
    title: "複数店舗のスタッフ・シフトをまとめて管理",
    body: "店舗ごとにスタッフ、シフトを設定できます。",
  },
  {
    icon: LuUsersRound,
    title: "シフト管理者を複数人登録可能",
    body: "募集・調整・確定を一人で抱えずに進められます。",
  },
];

export function OrganizationManagementSection() {
  return (
    <Box as="section" bg="white" py={{ base: 14, md: 20 }}>
      <Container maxW="7xl">
        <Grid
          templateAreas={{
            base: '"copy" "visual" "features"',
            lg: '"copy copy" "visual features"',
          }}
          templateColumns={{ base: "minmax(0, 1fr)", lg: "minmax(0, 1.12fr) minmax(0, 0.88fr)" }}
          maxW={{ lg: "1100px", xl: "1200px" }}
          mx="auto"
          columnGap={0}
          rowGap={{ base: 8, md: 10 }}
          alignItems="center"
        >
          <VStack gridArea="copy" align="center" width="full">
            <Heading as="h2" color="gray.950" fontSize={{ base: "2xl", md: "4xl" }} lineHeight="1.35" letterSpacing="0">
              複数店舗・複数管理者も対応
            </Heading>
          </VStack>

          <ManagementIllustration />

          <Stack gridArea="features" align={{ base: "center", lg: "stretch" }} gap={5} width="full" maxW="620px">
            {managementFeatures.map((feature) => (
              <ManagementFeature key={feature.title} {...feature} />
            ))}
          </Stack>
        </Grid>
      </Container>
    </Box>
  );
}

function ManagementFeature({ icon, title, body }: { icon: IconType; title: string; body: string }) {
  return (
    <Flex align="flex-start" direction="row" gap={{ base: 3, md: 4 }} width="full" textAlign="start">
      <Flex align="center" justify="center" boxSize={11} bg="teal.50" color="teal.700" borderRadius="lg" flexShrink={0}>
        <Icon as={icon} boxSize={6} />
      </Flex>
      <Box>
        <Heading as="h3" color="gray.950" fontSize="lg" lineHeight="1.5">
          {title}
        </Heading>
        <Text color="gray.700" fontSize="sm" lineHeight="1.8" mt={1}>
          {body}
        </Text>
      </Box>
    </Flex>
  );
}

function ManagementIllustration() {
  return (
    <Image
      src={managersImage}
      alt="複数のシフト担当者で管理を分担するイメージ"
      gridArea="visual"
      w="full"
      h="auto"
      aspectRatio={3 / 2}
      objectFit="contain"
      borderRadius="2xl"
      mx="auto"
      loading="lazy"
      decoding="async"
    />
  );
}
