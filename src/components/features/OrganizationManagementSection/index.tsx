import { Box, Container, Flex, Heading, Icon, Link, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBuilding2, LuCreditCard, LuStore, LuUserRoundPlus } from "react-icons/lu";

const managementCapabilities: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuBuilding2,
    title: "組織を分けて追加",
    body: "事業や契約を分けたいときは、別の組織を追加できます。自分で作成して保持できる有効な組織は3件までです。",
  },
  {
    icon: LuStore,
    title: "一つの組織に店舗を追加",
    body: "店舗ごとに募集とシフトを分けながら、組織全体の利用者と契約を一か所で管理できます。",
  },
  {
    icon: LuUserRoundPlus,
    title: "管理者を追加・交代",
    body: "既存スタッフまたは新しいユーザーへ、メールで管理者招待を送れます。有効な管理者は組織内のすべての店舗、利用者、契約プランと支払いを管理します。",
  },
  {
    icon: LuCreditCard,
    title: "プランと支払いを管理",
    body: "トライアル終了日、利用状況、契約プラン、支払いを組織設定で確認・変更できます。",
  },
];

export function OrganizationManagementSection() {
  return (
    <Box as="section" bg="white" py={{ base: 14, md: 20 }}>
      <Container maxW="7xl">
        <VStack gap={{ base: 8, md: 10 }}>
          <VStack gap={4} textAlign="center" maxW="780px">
            <Text color="teal.700" fontWeight="bold">
              店舗や担当者が増えても
            </Text>
            <Heading as="h2" color="gray.950" fontSize={{ base: "2xl", md: "4xl" }} lineHeight="1.35" letterSpacing="0">
              組織全体と、店舗ごとのシフト運用を分けて管理
            </Heading>
            <Text color="gray.700" lineHeight="1.8">
              毎日の募集・シフト作成は店舗ごとに進め、利用者、管理者、契約と支払いは組織ごとにまとめます。
            </Text>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={5} w="full">
            {managementCapabilities.map((capability) => (
              <ManagementCapabilityCard key={capability.title} {...capability} />
            ))}
          </SimpleGrid>

          <Link
            href="/pricing"
            color="teal.700"
            fontWeight="bold"
            display="inline-flex"
            alignItems="center"
            gap={2}
            _hover={{ textDecoration: "none", color: "teal.900" }}
          >
            料金・プランと利用上限を見る
            <Box as="span" aria-hidden>
              →
            </Box>
          </Link>
        </VStack>
      </Container>
    </Box>
  );
}

function ManagementCapabilityCard({ icon, title, body }: { icon: IconType; title: string; body: string }) {
  return (
    <Box bg="gray.50" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={6}>
      <Flex align="center" justify="center" boxSize={11} bg="teal.50" color="teal.700" borderRadius="lg">
        <Icon as={icon} boxSize={6} />
      </Flex>
      <Heading as="h3" color="gray.950" fontSize="lg" mt={5}>
        {title}
      </Heading>
      <Text color="gray.700" fontSize="sm" lineHeight="1.8" mt={3}>
        {body}
      </Text>
    </Box>
  );
}
