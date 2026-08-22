import { Box, Container, Flex, Grid, Heading, Icon, Image, Stack, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuStore, LuUsersRound } from "react-icons/lu";
import managersImage from "./managers.webp";

const managementFeatures: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuStore,
    title: "店舗ごとに整理して管理",
    body: "スタッフ、募集、シフト表を店舗ごとに分けて、必要な店舗へ切り替えられます。",
  },
  {
    icon: LuUsersRound,
    title: "複数の担当者で分担",
    body: "店長や副店長を管理者に追加して、募集・調整・確定を一人で抱えずに進められます。",
  },
];

export function OrganizationManagementSection() {
  return (
    <Box as="section" bg="white" py={{ base: 14, md: 20 }}>
      <Container maxW="7xl">
        <Grid
          templateAreas={{
            base: '"copy" "visual" "features"',
            lg: '"copy visual" "features visual"',
          }}
          templateColumns={{ base: "minmax(0, 1fr)", lg: "minmax(0, 0.88fr) minmax(0, 1.12fr)" }}
          columnGap={{ lg: 14, xl: 20 }}
          rowGap={{ base: 8, md: 10 }}
          alignItems="center"
        >
          <VStack gridArea="copy" align="start" gap={4} maxW="620px">
            <Text color="teal.700" fontWeight="bold">
              1店舗から、複数店舗まで
            </Text>
            <Heading as="h2" color="gray.950" fontSize={{ base: "2xl", md: "4xl" }} lineHeight="1.35" letterSpacing="0">
              店舗が増えても、
              <Box as="span" display="block">
                担当者が増えても。
              </Box>
            </Heading>
            <Text color="gray.700" lineHeight="1.9">
              店舗ごとにスタッフやシフトを分けながら、同じ管理画面から切り替えて管理できます。
              店長や副店長など、複数のシフト担当者で募集・調整・確定を分担できます。
            </Text>
          </VStack>

          <ManagementIllustration />

          <Stack gridArea="features" gap={5} maxW="620px">
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
    <Flex align="flex-start" gap={4}>
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
      maxW={{ lg: "420px", xl: "460px" }}
      aspectRatio={3 / 2}
      objectFit="contain"
      borderRadius="2xl"
      mx="auto"
      loading="lazy"
      decoding="async"
    />
  );
}
