import { Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
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

const content = buildLegalDocument(componentModules, frontmatterModules, CONTENT_FILENAME);

type CommercialTransactionsProps = {
  prices: PublicPlanPriceCatalog;
  disclosure: {
    name: string;
    address: string;
    phoneNumber: string;
  };
};

export function CommercialTransactions({ prices, disclosure }: CommercialTransactionsProps): ReactNode {
  const components = {
    ...commercialTransactionsMdxComponents,
    CommercialTransactionsName: () => <DisclosureValue value={disclosure.name} />,
    CommercialTransactionsAddress: () => <DisclosureValue value={disclosure.address} />,
    CommercialTransactionsPhoneNumber: () => <DisclosureValue value={disclosure.phoneNumber} />,
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

  return <LegalMarkdownPage content={content} components={components} />;
}

const commercialTransactionsMdxComponents = {
  PlanLimit,
} satisfies MdxComponents;

function DisclosureValue({ value }: { value: string }): ReactNode {
  return (
    <Text as="p" textStyle="bodySm" color="fg.muted" lineHeight={1.8} whiteSpace="pre-line">
      {value}
    </Text>
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
