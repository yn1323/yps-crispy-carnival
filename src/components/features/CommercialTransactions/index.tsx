import { Box, Link, Table, Text } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";
import {
  ORGANIZATION_PLAN_LIMITS,
  type OrganizationPlan,
  type OrganizationPlanLimits,
} from "@/convex/organizationBilling/planLimits";
import { LegalMarkdownPage } from "@/src/components/shared/LegalDocumentPage";
import { buildLegalDocument, type LegalMdxComponent } from "@/src/components/shared/LegalDocumentPage/legalContent";
import { formatPublicPlanPriceLine, type PublicPlanPriceCatalog } from "@/src/domains/publicPricing";
import type { MdxComponents } from "@/src/lib/mdx";

const CONTENT_FILENAME = "index.mdx";

const componentModules = import.meta.glob<LegalMdxComponent>("./content/*.mdx", {
  eager: true,
  query: "?mdx-component",
  import: "default",
});

const frontmatterModules = import.meta.glob<unknown>("./content/*.mdx", {
  eager: true,
  query: "?mdx-frontmatter",
  import: "default",
});

const sourceModules = import.meta.glob<string>("./content/*.mdx", {
  eager: true,
  query: "?mdx-source",
  import: "default",
});

const content = buildLegalDocument(componentModules, frontmatterModules, CONTENT_FILENAME);
const contentSource = Object.entries(sourceModules).find(([path]) => path.endsWith(`/${CONTENT_FILENAME}`))?.[1];

if (!contentSource) {
  throw new Error(`法務文書 "content/${CONTENT_FILENAME}" のsourceが見つかりません`);
}

const hasManualDisclosure = contentSource.includes("【手動入力：");

type CommercialTransactionsProps = {
  prices: PublicPlanPriceCatalog;
};

export function CommercialTransactions({ prices }: CommercialTransactionsProps): ReactNode {
  const components = {
    ...commercialTransactionsMdxComponents,
    PlanPrice: ({ plan }: PlanPriceProps) => {
      const price = prices[plan];

      return (
        <span
          data-public-plan-price={plan}
          data-currency={price.currency}
          data-unit-amount={price.unitAmount}
          data-interval={price.interval}
          data-interval-count={price.intervalCount}
          data-tax-behavior={price.taxBehavior}
        >
          {formatPublicPlanPriceLine(price)}
        </span>
      );
    },
  } satisfies MdxComponents;

  return <LegalMarkdownPage content={content} components={components} contentGap={6} />;
}

const commercialTransactionsMdxComponents = {
  table: (props: ComponentProps<"table">) => (
    <Box borderWidth="1px" borderColor="gray.200" borderRadius="xl" overflow="hidden">
      <Table.Root
        size="sm"
        w="full"
        style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}
        {...props}
      />
    </Box>
  ),
  thead: (props: ComponentProps<"thead">) => (
    <Table.Header
      position="absolute"
      w="1px"
      h="1px"
      p={0}
      m="-1px"
      overflow="hidden"
      clip="rect(0, 0, 0, 0)"
      whiteSpace="nowrap"
      border={0}
      {...props}
    />
  ),
  tbody: (props: ComponentProps<"tbody">) => <Table.Body {...props} />,
  tr: (props: ComponentProps<"tr">) => (
    <Table.Row
      display={{ base: "grid", md: "table-row" }}
      gridTemplateColumns="minmax(0, 1fr)"
      borderTopWidth={{ base: "1px", md: "0" }}
      borderColor="gray.200"
      css={{
        "&:first-of-type": {
          borderTopWidth: "0",
        },
        "&:not(:first-of-type) > td": {
          borderTopWidth: { md: "1px" },
        },
        "& > td:first-of-type": {
          width: { md: "212px" },
          color: "fg",
          fontWeight: "bold",
          paddingBottom: { base: "1", md: "5" },
          paddingRight: { md: "3" },
        },
        "& > td:last-of-type": {
          paddingTop: { base: "1", md: "5" },
          paddingLeft: { md: "3" },
        },
      }}
      {...props}
    />
  ),
  th: (props: ComponentProps<"th">) => <Table.ColumnHeader {...props} />,
  td: (props: ComponentProps<"td">) => (
    <Table.Cell
      display={{ base: "block", md: "table-cell" }}
      px={{ base: 4, md: 5 }}
      py={{ base: 4, md: 5 }}
      borderColor="gray.200"
      color="fg.muted"
      textStyle="bodySm"
      lineHeight={1.8}
      verticalAlign="top"
      {...props}
    />
  ),
  a: (props: ComponentProps<"a">) => <Link color="teal.700" fontWeight="semibold" {...props} />,
  ManualDisclosureNotice,
  PlanLimit,
} satisfies MdxComponents;

function ManualDisclosureNotice(): ReactNode {
  if (!hasManualDisclosure) {
    return null;
  }

  return (
    <Box bg="orange.50" borderWidth="1px" borderColor="orange.200" borderRadius="lg" px={4} py={3}>
      <Text textStyle="bodySm" color="orange.900" lineHeight={1.8} fontWeight="semibold">
        事業者名、運営責任者、所在地、電話番号は仮入力です。Production公開前に実在する情報へ置き換えてください。
      </Text>
    </Box>
  );
}

type PlanPriceProps = {
  plan: keyof PublicPlanPriceCatalog;
};

type PlanLimitProps = {
  plan: OrganizationPlan;
  field: keyof OrganizationPlanLimits;
};

function PlanLimit({ plan, field }: PlanLimitProps): ReactNode {
  return <>{ORGANIZATION_PLAN_LIMITS[plan][field]}</>;
}
