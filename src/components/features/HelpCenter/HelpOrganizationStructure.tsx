import { Box, Container, Heading, HStack, Image, Link, Stack, Table, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import organizationOverviewImage from "./content/images/organization-structure/shiftori_01_structure_staff.webp";
import staffAdminRelationshipImage from "./content/images/organization-structure/shiftori_02_staff_admin_relationship.webp";
import multipleOrganizationsImage from "./content/images/organization-structure/shiftori_03_multiple_organizations_staff.webp";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpSupport } from "./HelpSupport";
import { ORGANIZATION_STRUCTURE_HELP } from "./organizationStructureHelp";

const STRUCTURE_IMAGE_WIDTH = 1448;
const STRUCTURE_IMAGE_HEIGHT = 1086;

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
          gap={{ base: 10, lg: 14 }}
        >
          <StructureFigure
            headingId="organization-overview-title"
            src={organizationOverviewImage}
            alt="組織を中心に、一つのプラン、複数の店舗、スタッフ、組織全体を管理する管理者の関係を示す図"
            caption="組織がシフトリにおける最大の管理単位です。プランは店舗ごとではなく組織に一つ設定され、組織には利用できる店舗を少なくとも1店舗残します。"
            expandLabel="組織・店舗・スタッフの全体像"
            priority
          />
          <StructureFigure
            headingId="staff-admin-relationship-title"
            src={staffAdminRelationshipImage}
            alt="田中さんが店舗Aと店舗Bにスタッフとして所属し、同じ組織の管理者も兼ねる関係を示す図"
            caption="同じスタッフは、複数店舗に所属しても1名として数えます。管理者権限は店舗単位ではなく、組織全体に適用されます。"
            expandLabel="スタッフと管理者の関係"
          />
          <StructureFigure
            headingId="multiple-organizations-title"
            src={multipleOrganizationsImage}
            alt="一つのログイン用アカウントから、データが独立した組織Aと組織Bを切り替える関係を示す図"
            caption="組織を切り替えても、店舗・スタッフ・シフトは組織間で自動共有されません。自分で作成して保持できる組織は3つまでで、招待で所属する組織はこの上限に含みません。"
            expandLabel="複数の組織を使う場合"
          />
          <PlanRelationship />
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

function StructureFigure({
  headingId,
  src,
  alt,
  caption,
  expandLabel,
  priority = false,
}: {
  headingId: string;
  src: string;
  alt: string;
  caption: string;
  expandLabel: string;
  priority?: boolean;
}) {
  return (
    <Box as="figure" m={0} aria-labelledby={headingId}>
      <VisuallyHidden as="h2" id={headingId}>
        {expandLabel}
      </VisuallyHidden>
      <Box
        overflow="hidden"
        w="full"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="xl"
        bg="white"
        aspectRatio={STRUCTURE_IMAGE_WIDTH / STRUCTURE_IMAGE_HEIGHT}
      >
        <Image
          src={src}
          alt={alt}
          width={STRUCTURE_IMAGE_WIDTH}
          height={STRUCTURE_IMAGE_HEIGHT}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          w="full"
          h="full"
          objectFit="contain"
        />
      </Box>
      <Stack as="figcaption" mt={3} gap={2} align="flex-start">
        <Text color="gray.700" fontSize="sm" lineHeight="1.8">
          {caption}
        </Text>
        <Link
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          display={{ base: "inline-flex", lg: "none" }}
          alignItems="center"
          gap={1}
          color="teal.700"
          fontSize="sm"
          fontWeight="bold"
          aria-label={`${expandLabel}の画像を拡大して新しいタブで見る`}
        >
          画像を拡大して見る
          <LuArrowRight aria-hidden />
        </Link>
      </Stack>
    </Box>
  );
}

function PlanRelationship() {
  return (
    <Stack as="section" aria-labelledby="plan-relationship-title" gap={6}>
      <Stack gap={2}>
        <Heading id="plan-relationship-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          プランごとの利用上限
        </Heading>
        <Text color="gray.700" lineHeight="1.8">
          利用上限は、組織全体の利用人数、店舗数、有効な管理者数で数えます。
        </Text>
      </Stack>

      <PlanLimitsTable />

      <Stack gap={3}>
        <Box borderWidth="1px" borderColor="gray.200" borderRadius="lg" bg="gray.50" px={{ base: 4, md: 5 }} py={4}>
          <Stack gap={2}>
            <Text color="gray.950" fontWeight="bold">
              利用人数の数え方
            </Text>
            <Text color="gray.700" fontSize="sm" lineHeight="1.8">
              店舗に所属していない組織のユーザーも、登録されている間は利用人数に含まれます。管理者は利用人数と有効な管理者数の両方に含まれます。
            </Text>
          </Stack>
        </Box>

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
    </Stack>
  );
}

function PlanLimitsTable() {
  return (
    <Stack gap={3}>
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
