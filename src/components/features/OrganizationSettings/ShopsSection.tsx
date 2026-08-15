import { Box, Flex, Heading, HStack, Stack } from "@chakra-ui/react";
import { LuPlus, LuStore } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import { Empty } from "@/src/components/ui/Empty";
import type { BillingUsageView, OrganizationShopView } from "./types";

type Props = {
  shops: OrganizationShopView[];
  shopUsage: BillingUsageView;
  /** 旧応答との型互換用。現行契約では常にtrue。 */
  showAddShop: boolean;
  canAddShop: boolean;
  addShopDisabledReason?: string;
  onAddShop: () => void;
  onOpenShop: (shopId: string) => void;
};

export const ShopsSection = ({
  shops,
  shopUsage,
  showAddShop,
  canAddShop,
  addShopDisabledReason,
  onAddShop,
  onOpenShop,
}: Props) => (
  <Stack as="section" gap={4} aria-labelledby="organization-shops-heading">
    <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
      <HStack gap={2}>
        <LuStore aria-hidden />
        <Heading id="organization-shops-heading" as="h2" fontSize="lg">
          全店舗{shopUsage.max > 0 ? ` (${shopUsage.current}/${shopUsage.max})` : ""}
        </Heading>
      </HStack>
      {showAddShop && (
        <Button
          variant="ghost"
          size="sm"
          colorPalette="teal"
          onClick={onAddShop}
          disabled={!canAddShop}
          title={!canAddShop ? addShopDisabledReason : undefined}
          aria-describedby={!canAddShop && addShopDisabledReason ? "organization-shop-add-disabled-reason" : undefined}
          gap={1.5}
          fontWeight="semibold"
        >
          <LuPlus aria-hidden />
          店舗を追加する
        </Button>
      )}
    </Flex>

    {shops.length === 0 ? (
      <Empty icon={LuStore} title="登録されている店舗はありません。" titleAs="h3" variant="section" py={6} />
    ) : (
      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          {shops.map((shop) => (
            <ShopRow key={shop.id} shop={shop} onOpenShop={onOpenShop} />
          ))}
        </Stack>
      </Box>
    )}
  </Stack>
);

function ShopRow({ shop, onOpenShop }: { shop: OrganizationShopView; onOpenShop: (shopId: string) => void }) {
  return (
    <DrilldownRow
      ariaLabel={`${shop.name}の店舗詳細を開く`}
      title={shop.name}
      onClick={() => onOpenShop(shop.id)}
      leading={
        <Flex
          boxSize="40px"
          borderRadius="lg"
          bg="teal.100"
          color="teal.700"
          align="center"
          justify="center"
          flexShrink={0}
        >
          <LuStore aria-hidden />
        </Flex>
      }
    />
  );
}
