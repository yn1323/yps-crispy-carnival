import { Box, Flex, Heading, Icon, Image, LinkBox, LinkOverlay, Text } from "@chakra-ui/react";
import { LuArrowRight } from "react-icons/lu";
import type { ProductFeature } from "./productFeatureContent";

type FeatureCardProps = {
  feature: ProductFeature;
  /** 1ページ内の見出し階層に合わせる。 */
  headingAs?: "h2" | "h3";
  /** 毎月の流れの中での順番。流れに属さない機能では省略する。 */
  stepNumber?: number;
};

export function FeatureCard({ feature, headingAs = "h3", stepNumber }: FeatureCardProps) {
  return (
    <LinkBox
      as="article"
      display="flex"
      flexDirection="column"
      h="full"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="xl"
      overflow="hidden"
      transition="border-color 0.2s ease, box-shadow 0.2s ease"
      _hover={{ borderColor: "gray.300", boxShadow: "0 16px 34px rgba(15, 23, 42, 0.08)" }}
    >
      <Box bg="white" borderBottomWidth="1px" borderColor="gray.100">
        <Image
          src={feature.illustration.src}
          alt=""
          w="full"
          aspectRatio={3 / 2}
          objectFit="contain"
          loading="lazy"
          decoding="async"
        />
      </Box>
      <Flex direction="column" flex="1" gap={3} p={{ base: 5, md: 6 }}>
        <Flex align="center" gap={2} color="teal.700" fontSize="sm" fontWeight="bold">
          <Icon as={feature.icon} boxSize={5} aria-hidden />
          {stepNumber !== undefined && <Text as="span">STEP {stepNumber}</Text>}
        </Flex>
        <Heading
          as={headingAs}
          wordBreak="auto-phrase"
          color="gray.950"
          fontSize={{ base: "lg", md: "xl" }}
          lineHeight="1.45"
        >
          <LinkOverlay href={feature.href}>{feature.name}</LinkOverlay>
        </Heading>
        <Text color="gray.700" fontSize="sm" lineHeight="1.8">
          {feature.summary}
        </Text>
        <Flex align="center" gap={2} mt="auto" pt={2} color="teal.700" fontSize="sm" fontWeight="bold">
          詳しく見る
          <Icon as={LuArrowRight} boxSize={4} aria-hidden />
        </Flex>
      </Flex>
    </LinkBox>
  );
}
