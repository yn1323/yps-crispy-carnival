import { Box, Flex, Heading, Icon, LinkBox, LinkOverlay, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight, LuCheck } from "react-icons/lu";
import type { ProductFeature } from "./productFeatureContent";

type FeatureCardProps = {
  feature: ProductFeature;
  /** 機能一覧では、できることの見出しも並べてLPより詳しく見せる。 */
  showCapabilities?: boolean;
};

/** スマホでも一覧しやすいよう、イラストを持たない小さいカードにする。イラストは各機能ページのHeroで見せる。 */
export function FeatureCard({ feature, showCapabilities = false }: FeatureCardProps) {
  return (
    <LinkBox
      as="article"
      display="flex"
      flexDirection="column"
      gap={4}
      h="full"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="xl"
      p={{ base: 5, md: 6 }}
      transition="border-color 0.2s ease, box-shadow 0.2s ease"
      _hover={{ borderColor: "gray.300", boxShadow: "0 16px 34px rgba(15, 23, 42, 0.08)" }}
    >
      <Flex align="flex-start" gap={4}>
        <Flex
          align="center"
          justify="center"
          flexShrink={0}
          boxSize={12}
          bg="teal.50"
          color="teal.700"
          borderRadius="full"
        >
          <Icon as={feature.icon} boxSize={6} aria-hidden />
        </Flex>
        <Box minW={0}>
          <Heading as="h3" wordBreak="auto-phrase" color="gray.950" fontSize="lg" lineHeight="1.5">
            <LinkOverlay href={feature.href}>{feature.name}</LinkOverlay>
          </Heading>
          <Text mt={1} color="gray.700" fontSize="sm" lineHeight="1.8">
            {feature.summary}
          </Text>
        </Box>
      </Flex>
      {/* できることの見出しは16字前後あるため、アイコンの下まで使って1行に収める。 */}
      {showCapabilities && (
        <Stack
          as="ul"
          gap={2}
          pt={4}
          borderTopWidth="1px"
          borderColor="gray.100"
          listStyleType="none"
          aria-label={`${feature.name}でできること`}
        >
          {feature.capabilities.map((capability) => (
            <Flex
              as="li"
              key={capability.title}
              align="flex-start"
              gap={2}
              color="gray.900"
              fontSize="sm"
              lineHeight="1.6"
            >
              <Icon as={LuCheck} boxSize={4} mt={0.5} color="teal.600" flexShrink={0} aria-hidden />
              {capability.title}
            </Flex>
          ))}
        </Stack>
      )}
      <Flex align="center" gap={1.5} mt="auto" color="teal.700" fontSize="sm" fontWeight="bold">
        詳しく見る
        <Icon as={LuArrowRight} boxSize={4} aria-hidden />
      </Flex>
    </LinkBox>
  );
}
