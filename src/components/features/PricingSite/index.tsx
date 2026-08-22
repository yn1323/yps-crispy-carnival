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
    name: "無料トライアル",
    eyebrow: "初回登録から2か月",
    description: "クレジットカードを登録せず、Proと同じ機能と利用上限で実際のシフト運用を試せます。",
    priceLabel: "2か月無料",
    limits: ORGANIZATION_PLAN_LIMITS.trial,
    featured: true,
  },
  {
    id: "additional-free",
    name: "Free",
    eyebrow: "二つ目以降の組織",
    description: "追加した組織はFreeから始まり、支払い情報を登録せずに利用できます。",
    priceLabel: "無料",
    limits: ORGANIZATION_PLAN_LIMITS.free,
    featured: false,
  },
  {
    id: "additional-pro",
    name: "Pro",
    eyebrow: "追加組織の有料プラン",
    description: "追加組織の利用人数や稼働店舗数を増やしたい場合に選べます。",
    priceLabel: "料金は契約画面で確認",
    limits: ORGANIZATION_PLAN_LIMITS.pro,
    featured: false,
  },
  {
    id: "additional-business",
    name: "Business",
    eyebrow: "追加組織の有料プラン",
    description: "追加組織でより多くの利用者を管理したい場合に選べます。",
    priceLabel: "料金は契約画面で確認",
    limits: ORGANIZATION_PLAN_LIMITS.business,
    featured: false,
  },
] as const;

const billingFacts: Array<{ icon: IconType; title: string; body: string }> = [
  {
    icon: LuCalendarDays,
    title: "2か月の無料トライアル",
    body: "初回登録ではクレジットカードを求めず、Proと同じ機能と利用上限を2か月間試せます。",
  },
  {
    icon: LuStore,
    title: "店舗と管理者を追加",
    body: "各プランの上限まで稼働店舗と有効な管理者を追加できます。上限は組織ごとに適用されます。",
  },
  {
    icon: LuCreditCard,
    title: "有料プランは契約前に確認",
    body: "ProとBusinessの料金、通貨、税込・税別、請求周期は、Stripeで確認した値を契約画面に表示します。",
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
                2か月無料、カード登録なしで
                <Box as="span" display="block" color="teal.700">
                  実際のシフト運用を試せます
                </Box>
              </Heading>
              <Text color="gray.700" fontSize={{ base: "md", md: "lg" }} lineHeight="1.9" maxW="760px">
                無料トライアル中も、実際の店舗とスタッフを登録して、希望回収からシフト確定まで進められます。複数店舗と複数の管理者にも対応しています。
              </Text>
            </Stack>
            <Stack direction={{ base: "column", sm: "row" }} gap={3} align={{ base: "stretch", sm: "center" }}>
              <Button asChild colorPalette="teal" h="52px" px={7} fontWeight="bold">
                <MeasurementBoundaryLink href="/signup" measurementCtaId="pricing_signup">
                  シフトリを始める
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
                無料トライアルと利用プラン
              </Heading>
              <Text color="gray.700" lineHeight="1.8">
                初回登録から2か月は無料トライアルです。トライアル終了後も継続する場合はProまたはBusinessを選び、二つ目以降の組織はFreeから始められます。
              </Text>
            </Stack>
            <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} gap={5}>
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
            aria-labelledby="initial-registration-heading"
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
                <Heading
                  id="initial-registration-heading"
                  as="h2"
                  color="gray.950"
                  fontSize={{ base: "xl", md: "2xl" }}
                >
                  無料トライアル後は、利用プランを選べます
                </Heading>
                <Text color="gray.800" lineHeight="1.85">
                  無料トライアル中はクレジットカードの登録なしで、利用人数20名、稼働店舗5件、有効な管理者5名まで利用できます。
                </Text>
                <Text color="gray.800" lineHeight="1.85">
                  トライアル終了後も継続する場合はProまたはBusinessを選びます。有料プランを選ばない場合は、登録したデータを保持したまま業務操作が制限されます。料金と請求条件は、契約を確定する前に契約画面で確認できます。
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
