import { Box, Flex, Heading, HStack, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuChevronRight, LuPlus, LuSettings, LuStore, LuUsers } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";
import type { OrganizationShopView } from "./types";

type Props = {
  shops: OrganizationShopView[];
  canAddShop: boolean;
  addShopDisabledReason?: string;
  onAddShop: () => void;
  onOpenShop: (shopId: string) => void;
  onOpenShopSettings: (shopId: string) => void;
};

export const ShopsSection = ({
  shops,
  canAddShop,
  addShopDisabledReason,
  onAddShop,
  onOpenShop,
  onOpenShopSettings,
}: Props) => (
  <Stack as="section" gap={4} aria-labelledby="organization-shops-heading">
    <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
      <Stack gap={1}>
        <HStack gap={2}>
          <LuStore aria-hidden />
          <Heading id="organization-shops-heading" as="h2" fontSize="lg">
            グループの店舗
          </Heading>
        </HStack>
        <Text fontSize="sm" color="fg.muted">
          店舗ごとの所属スタッフ数を確認できます。
        </Text>
      </Stack>
      <Button
        size="sm"
        colorPalette="teal"
        onClick={onAddShop}
        disabled={!canAddShop}
        title={!canAddShop ? addShopDisabledReason : undefined}
        aria-describedby={!canAddShop && addShopDisabledReason ? "organization-shop-add-disabled-reason" : undefined}
        gap={1.5}
      >
        <LuPlus aria-hidden />
        店舗を追加
      </Button>
    </Flex>

    {!canAddShop && addShopDisabledReason && (
      <Text id="organization-shop-add-disabled-reason" fontSize="sm" color="orange.700">
        {addShopDisabledReason}
      </Text>
    )}

    {shops.length === 0 ? (
      <Box borderWidth="1px" borderStyle="dashed" borderRadius="xl" p={6} textAlign="center" color="fg.muted">
        登録されている店舗はありません。
      </Box>
    ) : (
      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.50" boxShadow="xs" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.50">
          {shops.map((shop) => (
            <ShopRow key={shop.id} shop={shop} onOpenShop={onOpenShop} onOpenShopSettings={onOpenShopSettings} />
          ))}
        </Stack>
      </Box>
    )}
  </Stack>
);

function ShopRow({
  shop,
  onOpenShop,
  onOpenShopSettings,
}: {
  shop: OrganizationShopView;
  onOpenShop: (shopId: string) => void;
  onOpenShopSettings: (shopId: string) => void;
}) {
  const descriptionId = `organization-shop-${shop.id}-summary`;
  const settingsDisabledReasonId = `organization-shop-${shop.id}-settings-disabled-reason`;
  return (
    <HStack gap={0} align="center" w="full">
      <Button
        variant="plain"
        aria-label={`${shop.name}の店舗詳細を開く`}
        aria-describedby={descriptionId}
        gap={3}
        px={{ base: 3, md: 4 }}
        py={3.5}
        minH="68px"
        h="auto"
        flex={1}
        minW={0}
        justifyContent="flex-start"
        textAlign="left"
        borderRadius={0}
        transition="background-color 150ms ease"
        _hover={{ bg: "blackAlpha.50" }}
        _focusVisible={{ outlineWidth: "2px", outlineStyle: "solid", outlineColor: "teal.500", outlineOffset: "-2px" }}
        onClick={() => onOpenShop(shop.id)}
      >
        <Flex
          boxSize="40px"
          borderRadius="lg"
          bg="teal.50"
          color="teal.700"
          align="center"
          justify="center"
          flexShrink={0}
        >
          <LuStore aria-hidden />
        </Flex>
        <Text fontWeight="semibold" color="gray.900" flex={1} minW={0} truncate>
          {shop.name}
        </Text>
        <HStack gap={1.5} color="fg.muted" flexShrink={0}>
          <LuUsers aria-hidden />
          <Text fontSize="sm">{shop.staffCount}名</Text>
        </HStack>
        <Flex color="fg.muted" fontSize="lg" flexShrink={0} aria-hidden>
          <LuChevronRight />
        </Flex>
      </Button>
      <Tooltip content={shop.canUpdateSettings ? "店舗設定" : shop.settingsDisabledReason}>
        <Box as="span" display="inline-flex" mx={{ base: 1, md: 2 }}>
          <IconButton
            aria-label={`${shop.name}の店舗設定を開く`}
            aria-describedby={
              !shop.canUpdateSettings && shop.settingsDisabledReason ? settingsDisabledReasonId : undefined
            }
            variant="ghost"
            colorPalette="teal"
            minW="44px"
            minH="44px"
            disabled={!shop.canUpdateSettings}
            title={!shop.canUpdateSettings ? shop.settingsDisabledReason : "店舗設定"}
            onClick={() => onOpenShopSettings(shop.id)}
          >
            <LuSettings aria-hidden />
          </IconButton>
        </Box>
      </Tooltip>
      <VisuallyHidden id={descriptionId}>所属スタッフ{shop.staffCount}名。</VisuallyHidden>
      {!shop.canUpdateSettings && shop.settingsDisabledReason && (
        <VisuallyHidden id={settingsDisabledReasonId}>{shop.settingsDisabledReason}</VisuallyHidden>
      )}
    </HStack>
  );
}
