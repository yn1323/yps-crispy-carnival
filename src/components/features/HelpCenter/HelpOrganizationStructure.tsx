import { Box, Container, Flex, Grid, Heading, HStack, Link, SimpleGrid, Stack, Table, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuArrowDown,
  LuArrowLeft,
  LuArrowRight,
  LuBuilding2,
  LuCreditCard,
  LuStore,
  LuUserRoundCog,
  LuUsers,
} from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpSupport } from "./HelpSupport";
import { ORGANIZATION_STRUCTURE_HELP } from "./organizationStructureHelp";

const PLAN_ROWS = [
  { id: "trial", label: "トライアル", note: "Proと同じ上限" },
  { id: "free", label: "Free" },
  { id: "standard", label: "Standard" },
  { id: "pro", label: "Pro" },
] as const;

export function HelpOrganizationStructure() {
  return (
    <PublicPageLayout>
      <Box borderBottomWidth="1px" borderColor="gray.200" bg="gray.50/60">
        <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 7, lg: 10 }}>
          <Stack gap={5} maxW="860px">
            <HelpBreadcrumbs />
            <Stack gap={3} align="flex-start">
              <HelpAudienceBadge audience={ORGANIZATION_STRUCTURE_HELP.audience} />
              <Heading
                id="help-organization-structure-title"
                as="h1"
                color="gray.950"
                fontSize={{ base: "2xl", lg: "3xl" }}
                lineHeight="1.4"
                letterSpacing="0"
                textWrap="balance"
              >
                {ORGANIZATION_STRUCTURE_HELP.title}
              </Heading>
              <Text color="gray.700" lineHeight="1.8">
                {ORGANIZATION_STRUCTURE_HELP.description}
              </Text>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 14 }}>
        <Stack
          as="article"
          aria-labelledby="help-organization-structure-title"
          maxW="960px"
          mx="auto"
          gap={{ base: 12, lg: 16 }}
        >
          <OrganizationOverview />
          <PersonRoleRelationship />
          <PlanRelationship />
          <MultipleOrganizations />
          <RelatedHelp />
          <HelpSupport />
        </Stack>
      </Container>
    </PublicPageLayout>
  );
}

function HelpBreadcrumbs() {
  return (
    <HStack as="nav" aria-label="パンくず" gap={2} wrap="wrap" color="gray.600" fontSize="sm">
      <Link href="/help" color="teal.700" fontWeight="semibold">
        ヘルプ・使い方
      </Link>
      <Text aria-hidden>/</Text>
      <Text color="gray.700" lineClamp={1}>
        {ORGANIZATION_STRUCTURE_HELP.title}
      </Text>
    </HStack>
  );
}

function OrganizationOverview() {
  return (
    <Stack as="section" aria-labelledby="organization-overview-title" gap={6}>
      <Stack gap={2}>
        <Heading id="organization-overview-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          全体の関係
        </Heading>
        <Text color="gray.700" lineHeight="1.8">
          組織が管理のまとまりです。店舗、スタッフ、管理者、プランは、すべて一つの組織に紐づきます。
        </Text>
      </Stack>

      <Box as="figure" m={0}>
        <Stack gap={0} align="stretch">
          <ConceptCard
            icon={LuBuilding2}
            label="管理のまとまり"
            title="組織"
            description="店舗、利用者、契約をまとめます。組織が異なると、店舗やスタッフ、シフト、プランも別々に管理されます。"
            highlighted
          />
          <DiagramConnector label="組織ごとに管理" />
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
            <ConceptCard
              icon={LuCreditCard}
              label="組織に1つ"
              title="プラン"
              description="同じ組織にあるすべての店舗へ、共通のプランと利用上限を適用します。"
            />
            <ConceptCard
              icon={LuStore}
              label="1つの組織に所属"
              title="店舗"
              description="シフト募集や勤務時間を管理する単位です。店舗ごとに所属スタッフを設定します。"
            />
            <ConceptCard
              icon={LuUsers}
              label="組織に登録"
              title="スタッフ・管理者"
              description="同じ人物が複数店舗に所属したり、スタッフと管理者を兼ねたりできます。"
            />
          </SimpleGrid>
        </Stack>
        <Text as="figcaption" mt={4} color="gray.600" fontSize="sm" lineHeight="1.7">
          店舗は必ず一つの組織に属します。組織には、利用できる店舗を少なくとも一つ残します。
        </Text>
      </Box>
    </Stack>
  );
}

function PersonRoleRelationship() {
  return (
    <Stack as="section" aria-labelledby="person-role-title" gap={6}>
      <Stack gap={2}>
        <Heading id="person-role-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          スタッフと管理者の関係
        </Heading>
        <Text color="gray.700" lineHeight="1.8">
          人物は組織に一人として登録され、店舗への所属と管理者権限をそれぞれ持てます。
        </Text>
      </Stack>

      <Box as="figure" m={0}>
        <Grid
          templateColumns={{ base: "1fr", lg: "minmax(0, 260px) 48px minmax(0, 1fr)" }}
          gap={{ base: 0, lg: 3 }}
          alignItems="stretch"
        >
          <ConceptCard
            icon={LuUsers}
            label="同じ一人"
            title="組織の利用者"
            description="氏名とシフト連絡先は組織ごとに管理します。"
            highlighted
          />
          <DiagramConnector compact />
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
            <ConceptCard
              icon={LuStore}
              label="スタッフとして"
              title="店舗A・店舗Bに所属"
              description="所属する店舗ごとに、希望シフトの提出や確定シフトの通知を受けます。所属店舗は0件にもできます。"
            />
            <ConceptCard
              icon={LuUserRoundCog}
              label="管理者として"
              title="組織全体を管理"
              description="管理者権限は店舗単位ではありません。同じ組織の店舗、スタッフ、プランを管理します。"
            />
          </SimpleGrid>
        </Grid>
        <Box mt={4} px={4} py={3} borderRadius="lg" bg="gray.50">
          <Text color="gray.700" fontSize="sm" lineHeight="1.7">
            複数店舗に所属しても、スタッフと管理者を兼ねても、利用人数は一人として数えます。店舗に所属していない人物も、組織に残っている間は利用人数に含まれます。
          </Text>
        </Box>
      </Box>
    </Stack>
  );
}

function PlanRelationship() {
  return (
    <Stack as="section" aria-labelledby="plan-relationship-title" gap={6}>
      <Stack gap={2}>
        <Heading id="plan-relationship-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          プランは組織ごとに1つ
        </Heading>
        <Text color="gray.700" lineHeight="1.8">
          店舗ごとの契約ではありません。同じ組織の利用人数、店舗数、有効な管理者数の合計に、組織のプラン上限を適用します。
        </Text>
      </Stack>

      <Box as="figure" m={0}>
        <Stack gap={0}>
          <ConceptCard
            icon={LuCreditCard}
            label="組織全体に適用"
            title="現在のプラン"
            description="一つのプランで、同じ組織にある店舗と利用者を管理します。"
            highlighted
          />
          <DiagramConnector label="次の3項目を合計" />
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
            <CountCard
              icon={LuUsers}
              title="利用人数"
              description="管理者とスタッフを合わせ、同じ人物は一人として数えます。"
            />
            <CountCard icon={LuStore} title="店舗数" description="削除されていない店舗を、組織全体で数えます。" />
            <CountCard
              icon={LuUserRoundCog}
              title="管理者数"
              description="現在有効な管理者を数えます。管理者は利用人数にも含まれます。"
            />
          </SimpleGrid>
        </Stack>
      </Box>

      <PlanLimitsTable />

      <Box borderWidth="1px" borderColor="gray.200" borderRadius="lg" bg="gray.50" px={{ base: 4, md: 5 }} py={4}>
        <Stack gap={2}>
          <Text color="gray.950" fontWeight="bold">
            上限に達した場合
          </Text>
          <Text color="gray.700" fontSize="sm" lineHeight="1.8">
            上限を超える追加は保存されません。プラン変更後などに既存の件数が上限を超えた場合も、登録済みのデータは削除されません。上位プランへ変更するか、利用人数、店舗数、管理者数を上限内に減らすと、通常の操作を再開できます。
          </Text>
        </Stack>
      </Box>
    </Stack>
  );
}

function PlanLimitsTable() {
  return (
    <Stack gap={3}>
      <Heading as="h3" color="gray.950" fontSize={{ base: "lg", md: "xl" }}>
        プランごとの利用上限
      </Heading>
      <Box overflowX="auto" borderWidth="1px" borderColor="gray.200" borderRadius="lg">
        <Table.Root size="sm" minW="560px">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader bg="gray.50" color="gray.900">
                プラン
              </Table.ColumnHeader>
              <Table.ColumnHeader bg="gray.50" color="gray.900" textAlign="end">
                利用人数
              </Table.ColumnHeader>
              <Table.ColumnHeader bg="gray.50" color="gray.900" textAlign="end">
                店舗
              </Table.ColumnHeader>
              <Table.ColumnHeader bg="gray.50" color="gray.900" textAlign="end">
                管理者
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {PLAN_ROWS.map((row) => {
              const limits = ORGANIZATION_PLAN_LIMITS[row.id];
              return (
                <Table.Row key={row.id}>
                  <Table.Cell color="gray.950" fontWeight="bold">
                    {row.label}
                    {"note" in row && (
                      <Text as="span" ms={2} color="gray.600" fontSize="xs" fontWeight="normal">
                        {row.note}
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell color="gray.800" textAlign="end">
                    {limits.maxPeople}名まで
                  </Table.Cell>
                  <Table.Cell color="gray.800" textAlign="end">
                    {limits.maxShops}店舗まで
                  </Table.Cell>
                  <Table.Cell color="gray.800" textAlign="end">
                    {limits.maxActiveManagers}名まで
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Box>
      <Text color="gray.600" fontSize="sm" lineHeight="1.7">
        支払い不要Pro相当を利用している組織にも、Proと同じ上限を適用します。未承認の管理者招待は現在の利用数に含めませんが、招待を出せるかの判定では必要な枠を確保します。
      </Text>
    </Stack>
  );
}

function MultipleOrganizations() {
  return (
    <Stack as="section" aria-labelledby="multiple-organizations-title" gap={6}>
      <Stack gap={2}>
        <Heading id="multiple-organizations-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          複数の組織を使う場合
        </Heading>
        <Text color="gray.700" lineHeight="1.8">
          一つのログイン用アカウントで、複数の組織に所属できます。組織ごとにプランとデータを切り替えて使います。
        </Text>
      </Stack>

      <Box as="figure" m={0}>
        <Stack gap={0}>
          <ConceptCard
            icon={LuUsers}
            label="同じログイン"
            title="ログイン用アカウント"
            description="招待を受けると、同じアカウントから別の組織へ切り替えられます。"
            highlighted
          />
          <DiagramConnector label="組織を切り替える" />
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
            <ConceptCard
              icon={LuBuilding2}
              label="独立して管理"
              title="組織A"
              description="組織Aのプラン、店舗、スタッフ、シフトを持ちます。"
            />
            <ConceptCard
              icon={LuBuilding2}
              label="独立して管理"
              title="組織B"
              description="組織Bのプラン、店舗、スタッフ、シフトを持ちます。"
            />
          </SimpleGrid>
        </Stack>
        <Text as="figcaption" mt={4} color="gray.600" fontSize="sm" lineHeight="1.7">
          自分で作成して保持できる組織は3つまでです。招待されて所属する組織は、この3つに含みません。別の組織へ店舗やスタッフ、シフトを自動で共有することはありません。
        </Text>
      </Box>
    </Stack>
  );
}

function RelatedHelp() {
  return (
    <Stack as="section" aria-labelledby="related-help-title" gap={4}>
      <Heading id="related-help-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
        次に確認する
      </Heading>
      <Link
        href="/help/check-plan-and-usage"
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={4}
        minH="88px"
        px={{ base: 4, md: 5 }}
        py={4}
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        color="gray.950"
        bg="white"
        textDecoration="none"
        _hover={{ borderColor: "gray.400", bg: "gray.50", textDecoration: "none" }}
        _active={{ bg: "gray.100" }}
        _focusVisible={{ borderColor: "teal.600", boxShadow: "0 0 0 2px var(--chakra-colors-teal-600)" }}
      >
        <Stack gap={1}>
          <Text fontWeight="bold">現在のプランと利用状況を確認する</Text>
          <Text color="gray.600" fontSize="sm" lineHeight="1.7">
            管理画面で現在のプランと、利用人数・店舗数・管理者数を確認します。
          </Text>
        </Stack>
        <LuArrowRight aria-hidden color="var(--chakra-colors-teal-700)" />
      </Link>
      <Link href="/help" color="teal.700" fontWeight="bold" display="flex" alignItems="center" gap={2} w="fit-content">
        <LuArrowLeft aria-hidden />
        ヘルプ・使い方TOPに戻る
      </Link>
    </Stack>
  );
}

function ConceptCard({
  icon: ConceptIcon,
  label,
  title,
  description,
  highlighted = false,
}: {
  icon: IconType;
  label: string;
  title: string;
  description: string;
  highlighted?: boolean;
}) {
  return (
    <Stack
      gap={3}
      h="full"
      p={{ base: 4, md: 5 }}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="xl"
      bg={highlighted ? "teal.50" : "white"}
    >
      <Flex align="center" gap={3}>
        <Flex
          align="center"
          justify="center"
          boxSize={10}
          flexShrink={0}
          borderRadius="lg"
          bg={highlighted ? "teal.100" : "gray.100"}
        >
          <ConceptIcon
            aria-hidden
            color={highlighted ? "var(--chakra-colors-teal-800)" : "var(--chakra-colors-gray-700)"}
          />
        </Flex>
        <Stack gap={0}>
          <Text color={highlighted ? "teal.800" : "gray.600"} fontSize="xs" fontWeight="bold">
            {label}
          </Text>
          <Text color="gray.950" fontWeight="bold" fontSize={{ base: "md", md: "lg" }}>
            {title}
          </Text>
        </Stack>
      </Flex>
      <Text color="gray.700" fontSize="sm" lineHeight="1.8">
        {description}
      </Text>
    </Stack>
  );
}

function CountCard({ icon, title, description }: { icon: IconType; title: string; description: string }) {
  return <ConceptCard icon={icon} label="プラン上限の対象" title={title} description={description} />;
}

function DiagramConnector({ label, compact = false }: { label?: string; compact?: boolean }) {
  return (
    <Flex
      aria-hidden
      direction={{ base: "column", lg: compact ? "row" : "column" }}
      align="center"
      justify="center"
      gap={1}
      py={compact ? { base: 2, lg: 0 } : 2}
      color="gray.500"
    >
      {compact ? (
        <>
          <Box display={{ base: "block", lg: "none" }}>
            <LuArrowDown />
          </Box>
          <Box display={{ base: "none", lg: "block" }}>
            <LuArrowRight />
          </Box>
        </>
      ) : (
        <>
          {label && (
            <Text fontSize="xs" fontWeight="bold">
              {label}
            </Text>
          )}
          <LuArrowDown />
        </>
      )}
    </Flex>
  );
}
