import { Box, Container, Flex, Heading, Icon, Link, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBuilding2, LuCreditCard, LuStore, LuUserRoundPlus } from "react-icons/lu";

const managementCapabilities: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuBuilding2,
    title: "複数の組織を切り替え",
    body: "最初の組織に加えて、用途ごとの組織を作成できます。組織ごとに店舗、スタッフ、プランを分けて管理します。",
  },
  {
    icon: LuStore,
    title: "一店舗から複数店舗へ",
    body: "初回登録では店舗を一つ作り、プラン上限まで店舗を追加できます。操作する店舗はダッシュボードから切り替えます。",
  },
  {
    icon: LuUserRoundPlus,
    title: "管理者をメールで招待",
    body: "初回登録した本人から始め、別の管理者を招待できます。スタッフは専用アカウントを作らず、届いたリンクから希望を提出できます。",
  },
  {
    icon: LuCreditCard,
    title: "支払い情報の登録は不要",
    body: "最初の組織には支払い不要のBusinessが適用されます。初回登録でカード情報を入力する必要はありません。",
  },
];

export function OrganizationManagementSection() {
  return (
    <Box as="section" bg="white" py={{ base: 14, md: 20 }}>
      <Container maxW="7xl">
        <VStack gap={{ base: 8, md: 10 }}>
          <VStack gap={4} textAlign="center" maxW="780px">
            <Text color="teal.700" fontWeight="bold">
              1組織・1店舗・1管理者から
            </Text>
            <Heading as="h2" color="gray.950" fontSize={{ base: "2xl", md: "4xl" }} lineHeight="1.35" letterSpacing="0">
              組織と店舗を切り替えて、シフト運用を同じ場所で管理
            </Heading>
            <Text color="gray.700" lineHeight="1.8">
              希望回収、スタッフ管理、シフト作成、確定通知までを組織と店舗ごとにまとめ、必要な管理者と分担できます。
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
            料金・プランを見る
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
