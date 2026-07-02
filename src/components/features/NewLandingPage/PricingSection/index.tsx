import { Box, Container, Flex, Heading, Icon, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

const plans = [
  {
    name: "無料プラン",
    lead: "まず試したい小規模店舗に。",
    price: "¥0",
    suffix: "/月",
    features: ["スタッフ数：〜10名程度", "基本機能をすべて利用可能"],
    cta: "無料で始める",
    href: "/signup",
  },
  {
    name: "スタンダード",
    lead: "スタッフ数が増えてきたお店に。",
    price: "¥980",
    suffix: "/月〜",
    features: ["スタッフ数上限アップ", "より便利な運用機能"],
    cta: "プランを見る",
    href: "#pricing",
  },
  {
    name: "店舗管理プラン",
    lead: "複数店舗・複数マネージャーで使いたいお店に。",
    price: "¥2,980",
    suffix: "/月〜",
    features: ["複数店舗のシフトをまとめて管理", "権限・マネージャー管理"],
    cta: "プランを見る",
    href: "#pricing",
  },
  {
    name: "AIシフト作成オプション",
    lead: "集まった希望シフトから、AIがたたき台を自動作成。",
    price: "+¥980",
    suffix: "/月〜",
    features: ["AIが割当案を自動作成", "調整の時間を短縮"],
    cta: "オプションを追加",
    href: "#pricing",
    featured: true,
  },
];

export const PricingSection = () => (
  <Box as="section" id="pricing" bg="white" py={16}>
    <Container maxW="7xl">
      <VStack gap={8}>
        <VStack gap={3} textAlign="center">
          <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0">
            シフト管理は、無料から始められます。
          </Heading>
          <Text color="gray.700" fontSize="md" lineHeight="1.8" fontWeight="semibold">
            少人数のお店なら無料プランのままでOK。人数や店舗が増えたら、そのまま広げられます。
          </Text>
        </VStack>

        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={5} w="full">
          {plans.map((plan) => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </SimpleGrid>

        <Text color="gray.600" fontSize="xs" textAlign="center" lineHeight="1.8">
          料金はすべて税抜価格です。上位プランは一例です。詳細は料金ページをご確認ください。
        </Text>
      </VStack>
    </Container>
  </Box>
);

const PricingCard = ({
  name,
  lead,
  price,
  suffix,
  features,
  cta,
  href,
  featured = false,
}: {
  name: string;
  lead: string;
  price: string;
  suffix: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
}) => (
  <Flex
    direction="column"
    minH="360px"
    bg="white"
    borderWidth={featured ? "2px" : "1px"}
    borderColor={featured ? "teal.500" : "gray.200"}
    borderRadius="lg"
    p={7}
    boxShadow={featured ? "0 18px 36px rgba(0, 128, 112, 0.12)" : "0 12px 28px rgba(15, 23, 42, 0.04)"}
  >
    <Text color={featured ? "teal.700" : "gray.950"} fontSize="lg" fontWeight="black" lineHeight="1.5">
      {name}
    </Text>
    <Text mt={3} minH="48px" color="gray.700" fontSize="sm" lineHeight="1.7" fontWeight="semibold">
      {lead}
    </Text>

    <Flex align="end" gap={1} mt={5}>
      <Text color="gray.950" fontSize="4xl" fontWeight="black" lineHeight="1">
        {price}
      </Text>
      <Text color="gray.700" fontSize="md" fontWeight="bold">
        {suffix}
      </Text>
    </Flex>

    <VStack align="stretch" gap={3} mt={6} flex="1">
      {features.map((feature) => (
        <Flex key={feature} align="center" gap={3}>
          <Icon as={LuCheck} boxSize={5} color="teal.600" />
          <Text color="gray.800" fontSize="sm" fontWeight="bold" lineHeight="1.6">
            {feature}
          </Text>
        </Flex>
      ))}
    </VStack>

    <Button
      asChild
      variant={featured ? "solid" : "outline"}
      colorPalette="teal"
      mt={7}
      h="42px"
      borderRadius="md"
      fontWeight="bold"
    >
      <a href={href}>{cta}</a>
    </Button>
  </Flex>
);
