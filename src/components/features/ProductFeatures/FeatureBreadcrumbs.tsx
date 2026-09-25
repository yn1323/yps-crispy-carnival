import { HStack, Link, Text } from "@chakra-ui/react";
import { Fragment } from "react";

export type FeatureBreadcrumbItem = {
  label: string;
  href?: string;
};

/** 構造化データのBreadcrumbListと同じ階層を、画面上にも表示する。 */
export function FeatureBreadcrumbs({ items }: { items: FeatureBreadcrumbItem[] }) {
  return (
    <HStack as="nav" aria-label="パンくず" gap={2} wrap="wrap" color="gray.600" fontSize="sm">
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && <Text aria-hidden>/</Text>}
          {item.href ? (
            <Link href={item.href} color="teal.700" fontWeight="semibold">
              {item.label}
            </Link>
          ) : (
            <Text as="span" color="gray.700" aria-current="page" lineClamp={1}>
              {item.label}
            </Text>
          )}
        </Fragment>
      ))}
    </HStack>
  );
}
