import { Badge, Box, Container, Flex, Heading, Icon, Link, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuBuilding2, LuCalendarDays, LuChevronRight, LuCreditCard, LuStore, LuUsers } from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { MeasurementBoundaryLink } from "@/src/components/shared/MeasurementBoundaryLink";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { Button } from "@/src/components/ui/Button";

const planCards = [
  {
    id: "trial",
    name: "2暦月トライアル",
    eyebrow: "新しい組織",
    description: "組織を作成した日から2暦月、Proと同じ機能・上限を試せます。",
    priceLabel: "作成日から2暦月",
    limits: ORGANIZATION_PLAN_LIMITS.trial,
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    eyebrow: "通常運用",
    description: "希望回収からシフト作成、複数店舗・管理者の運用まで、すべての機能を利用できます。",
    priceLabel: "月額料金・税込/税別は契約画面に表示",
    limits: ORGANIZATION_PLAN_LIMITS.pro,
    featured: false,
  },
  {
    id: "business",
    name: "Business",
    eyebrow: "利用人数が多い組織",
    description: "Proと同じ機能を、より多い利用人数で運用できます。",
    priceLabel: "月額料金・税込/税別は契約画面に表示",
    limits: ORGANIZATION_PLAN_LIMITS.business,
    featured: false,
  },
] as const;

const billingFacts: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuBuilding2,
    title: "契約と支払いは組織単位",
    body: "一つの組織に店舗、利用者、管理者、プランと支払いをまとめます。自分で作成して保持できる有効な組織は3件までです。",
  },
  {
    icon: LuStore,
    title: "管理者は組織全体を管理",
    body: "有効な管理者は、組織内のすべての店舗と利用者、プラン、支払いを管理します。店舗限定の管理者権限はありません。",
  },
  {
    icon: LuCreditCard,
    title: "金額を確認してから契約",
    body: "ProとBusinessの最新の月額料金は、Stripeに登録されたPriceを契約画面に表示します。金額と税込・税別を確認してから支払い方法を登録できます。",
  },
];

export function PricingSite() {
  return (
    <PublicPageLayout headerProps={{ showLinks: false }}>
      <Box bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
        <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, md: 14 }}>
          <Link href="/" color="teal.700" fontSize="sm" fontWeight="bold" _hover={{ textDecoration: "none" }}>
            ← TOPへ
          </Link>
          <Stack gap={6} maxW="840px" mt={6}>
            <Stack gap={4}>
              <Badge alignSelf="flex-start" colorPalette="teal" variant="subtle" borderRadius="full" px={3} py={1}>
                料金・プラン
              </Badge>
              <Heading
                as="h1"
                color="gray.950"
                fontSize={{ base: "3xl", md: "5xl" }}
                lineHeight="1.25"
                letterSpacing="0"
              >
                2暦月のトライアルで、
                <Box as="span" display="block" color="teal.700">
                  実際のシフト運用を試せます
                </Box>
              </Heading>
              <Text color="gray.700" fontSize={{ base: "md", md: "lg" }} lineHeight="1.9" maxW="760px">
                新しく作る組織は、作成日から2暦月のトライアルで始まります。トライアル終了後も利用する場合は、ProまたはBusinessを契約してください。
              </Text>
            </Stack>
            <Stack direction={{ base: "column", sm: "row" }} gap={3} align={{ base: "stretch", sm: "center" }}>
              <Button asChild colorPalette="teal" h="52px" px={7} fontWeight="bold">
                <MeasurementBoundaryLink href="/signup" measurementCtaId="pricing_signup">
                  2暦月トライアルを始める
                  <Icon as={LuChevronRight} boxSize={5} />
                </MeasurementBoundaryLink>
              </Button>
              <Button asChild variant="outline" colorPalette="teal" bg="white" h="52px" px={7} fontWeight="bold">
                <MeasurementBoundaryLink href="/demo/flow" measurementCtaId="pricing_demo">
                  登録せず無料デモを試す
                </MeasurementBoundaryLink>
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 12, md: 18 }}>
        <Stack gap={{ base: 12, md: 16 }}>
          <Box as="section" aria-labelledby="plan-comparison-heading">
            <Stack gap={3} maxW="760px" mb={7}>
              <Heading id="plan-comparison-heading" as="h2" color="gray.950" fontSize={{ base: "2xl", md: "3xl" }}>
                トライアルと有料プラン
              </Heading>
              <Text color="gray.700" lineHeight="1.8">
                ProとBusinessで利用できる機能に差はありません。組織で利用する人数に合わせて選びます。
              </Text>
            </Stack>
            <SimpleGrid columns={{ base: 1, lg: 3 }} gap={5}>
              {planCards.map((plan) => (
                <PlanCard key={plan.id} {...plan} />
              ))}
            </SimpleGrid>
          </Box>

          <Box as="section" aria-labelledby="billing-unit-heading">
            <Heading id="billing-unit-heading" as="h2" color="gray.950" fontSize={{ base: "2xl", md: "3xl" }} mb={7}>
              組織、店舗、管理者と支払いの関係
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 3 }} gap={5}>
              {billingFacts.map((fact) => (
                <Box key={fact.title} bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={6}>
                  <Flex align="center" justify="center" boxSize={11} bg="teal.50" color="teal.700" borderRadius="lg">
                    <Icon as={fact.icon} boxSize={6} />
                  </Flex>
                  <Heading as="h3" color="gray.950" fontSize="lg" mt={5}>
                    {fact.title}
                  </Heading>
                  <Text color="gray.700" fontSize="sm" lineHeight="1.8" mt={3}>
                    {fact.body}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </Box>

          <Box
            as="section"
            aria-labelledby="trial-ending-heading"
            bg="teal.50"
            borderRadius="2xl"
            px={{ base: 5, md: 8 }}
            py={{ base: 7, md: 8 }}
          >
            <Flex align="flex-start" gap={4}>
              <Flex
                align="center"
                justify="center"
                boxSize={11}
                bg="teal.100"
                color="teal.800"
                borderRadius="lg"
                flexShrink={0}
              >
                <Icon as={LuCalendarDays} boxSize={6} />
              </Flex>
              <Stack gap={3}>
                <Heading id="trial-ending-heading" as="h2" color="gray.950" fontSize={{ base: "xl", md: "2xl" }}>
                  トライアル終了日と、その後の利用
                </Heading>
                <Text color="gray.800" lineHeight="1.85">
                  トライアル終了日は組織設定に表示します。たとえば7月14日に組織を作成した場合、9月14日0:00（日本時間）に終了します。
                </Text>
                <Text color="gray.800" lineHeight="1.85">
                  終了時点でProまたはBusinessを契約していない場合は、組織のデータを保持したまま利用を制限します。契約手続きを完了すると、同じ組織で運用を再開できます。
                </Text>
                <Text color="gray.700" fontSize="sm" lineHeight="1.8">
                  これまでに無償利用の対象となった組織は、案内済みの利用条件を継続します。
                </Text>
              </Stack>
            </Flex>
          </Box>
        </Stack>
      </Container>
    </PublicPageLayout>
  );
}

function PlanCard({ name, eyebrow, description, priceLabel, limits, featured }: (typeof planCards)[number]) {
  return (
    <Box bg={featured ? "teal.50" : "white"} borderWidth="1px" borderColor="gray.200" borderRadius="2xl" px={6} py={7}>
      <Text color="teal.800" fontSize="sm" fontWeight="bold">
        {eyebrow}
      </Text>
      <Heading as="h3" color="gray.950" fontSize="2xl" mt={2}>
        {name}
      </Heading>
      <Text color="gray.700" fontSize="sm" lineHeight="1.8" minH={{ lg: "76px" }} mt={3}>
        {description}
      </Text>
      <Text color="gray.950" fontWeight="bold" mt={5}>
        {priceLabel}
      </Text>
      <Stack as="ul" gap={3} listStyle="none" p={0} mt={6}>
        <PlanLimit icon={LuUsers} label={`利用人数 ${limits.maxPeople}名まで`} />
        <PlanLimit icon={LuStore} label={`稼働店舗 ${limits.maxActiveShops}店舗まで`} />
        <PlanLimit icon={LuBuilding2} label={`有効な管理者 ${limits.maxActiveManagers}名まで`} />
      </Stack>
    </Box>
  );
}

function PlanLimit({ icon, label }: { icon: IconType; label: string }) {
  return (
    <Flex as="li" align="center" gap={3} color="gray.800" fontSize="sm" fontWeight="semibold">
      <Icon as={icon} boxSize={5} color="teal.700" flexShrink={0} />
      {label}
    </Flex>
  );
}
