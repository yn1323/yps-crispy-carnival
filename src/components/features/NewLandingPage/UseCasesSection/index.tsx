import { Box, Container, Flex, Heading, Icon, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBot, LuBuilding2, LuHouse, LuScissors, LuShoppingCart, LuUsers, LuUtensils } from "react-icons/lu";

const industries: Array<{ icon: IconType; label: string }> = [
  { icon: LuUtensils, label: "飲食店" },
  { icon: LuShoppingCart, label: "小売店" },
  { icon: LuUsers, label: "介護・施設" },
  { icon: LuHouse, label: "イベント運営" },
  { icon: LuScissors, label: "美容・サロン" },
];

const paidFeatures: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuBuilding2,
    title: "複数店舗のシフト管理",
    body: "複数店舗のシフトをひとつの画面でまとめて管理。店舗ごとにマネージャーを分けて運用できます。",
  },
  {
    icon: LuBot,
    title: "AIシフト作成（たたき台）",
    body: "集まった希望シフトから、AIがたたき台を自動作成。仕上げの調整に集中できます。",
  },
];

export const UseCasesSection = () => (
  <Box as="section" id="use-cases" bg="#fbfefe" py={14}>
    <Container maxW="7xl">
      <VStack align="stretch" gap={12}>
        <VStack align="stretch" gap={5}>
          <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0">
            いろいろなお店で使われています。
          </Heading>
          <SimpleGrid columns={{ base: 2, md: 5, lg: 5 }} gap={4}>
            {industries.map((industry) => (
              <IndustryItem key={industry.label} {...industry} />
            ))}
          </SimpleGrid>
          <Text color="gray.700" fontSize="sm" lineHeight="1.8" fontWeight="semibold">
            ランチ・ディナー、平日・週末、早番・遅番、短期スタッフなど、お店のシフトの組み方に合わせて使えます。
          </Text>
        </VStack>

        <VStack align="stretch" gap={5}>
          <Heading as="h2" fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.5" letterSpacing="0">
            有料プランで、さらに便利に。
          </Heading>
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={5}>
            {paidFeatures.map((feature) => (
              <PaidFeatureCard key={feature.title} {...feature} />
            ))}
          </SimpleGrid>
          <Text color="gray.600" fontSize="xs" textAlign="center">
            上位プランまたはオプションとして提供予定の機能を含みます。
          </Text>
        </VStack>
      </VStack>
    </Container>
  </Box>
);

const IndustryItem = ({ icon, label }: { icon: IconType; label: string }) => (
  <Flex direction="column" align="center" gap={3} minH="112px" justify="center">
    <Icon as={icon} boxSize={10} color="gray.800" strokeWidth={1.7} />
    <Text color="gray.950" fontSize="sm" fontWeight="bold" textAlign="center" lineHeight="1.5">
      {label}
    </Text>
  </Flex>
);

const PaidFeatureCard = ({ icon, title, body }: { icon: IconType; title: string; body: string }) => (
  <Box
    bg="white"
    borderWidth="1px"
    borderColor="gray.200"
    borderRadius="lg"
    p={7}
    boxShadow="0 14px 28px rgba(15, 23, 42, 0.04)"
  >
    <Flex align="center" justify="center" boxSize={16} bg="teal.50" color="teal.600" borderRadius="lg">
      <Icon as={icon} boxSize={8} />
    </Flex>
    <Text mt={5} color="gray.950" fontSize="lg" fontWeight="black" lineHeight="1.55">
      {title}
    </Text>
    <Text mt={3} color="gray.700" fontSize="sm" lineHeight="1.8" fontWeight="semibold">
      {body}
    </Text>
  </Box>
);
