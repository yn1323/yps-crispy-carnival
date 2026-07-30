import {
  Badge,
  Box,
  Flex,
  Heading,
  HStack,
  Icon,
  Menu,
  Portal,
  Skeleton,
  Stack,
  Text,
  VisuallyHidden,
} from "@chakra-ui/react";
import { LuBuilding2, LuCheck, LuChevronDown, LuSettings } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";
import type { ShopContextOption } from "@/src/domains/shop/context";
import type { OperationContextModel } from "./script";

export type OperationContextViewProps = {
  model: OperationContextModel;
  onShopSelect: (shopId: string) => void;
  onOpenShopDetail: () => void;
  onOpenGroupSettings?: () => void;
};

export const OperationContextView = ({
  model,
  onShopSelect,
  onOpenShopDetail,
  onOpenGroupSettings,
}: OperationContextViewProps) => {
  return (
    <Stack gap={3} pb={{ base: 4, lg: 6 }} borderBottomWidth="1px" borderColor="gray.200">
      {onOpenGroupSettings && (
        <Flex justify="flex-end" minW={0}>
          <Button
            type="button"
            variant="ghost"
            colorPalette="teal"
            size="sm"
            gap={1.5}
            fontWeight="semibold"
            flexShrink={0}
            onClick={onOpenGroupSettings}
          >
            <LuBuilding2 aria-hidden />
            グループ設定
          </Button>
        </Flex>
      )}

      <Flex align="center" justify="space-between" direction="row" gap={3} minW={0}>
        <ShopSelector model={model} onSelect={onShopSelect} />
        <ShopDetailButton onOpenShopDetail={onOpenShopDetail} />
      </Flex>
    </Stack>
  );
};

const ShopDetailButton = ({ onOpenShopDetail }: { onOpenShopDetail: () => void }) => (
  <Tooltip content="店舗詳細">
    <Box as="span" display="inline-flex">
      <IconButton
        type="button"
        variant="ghost"
        colorPalette="teal"
        minW="44px"
        minH="44px"
        aria-label="店舗詳細を開く"
        title="店舗詳細"
        onClick={onOpenShopDetail}
      >
        <LuSettings aria-hidden />
      </IconButton>
    </Box>
  </Tooltip>
);

const ShopSelector = ({ model, onSelect }: { model: OperationContextModel; onSelect: (shopId: string) => void }) => {
  if (!model.canSwitchShop) {
    return (
      <HStack gap={2} flex={1} minW={0}>
        <Heading as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900" truncate minW={0}>
          {model.selectedShop.shopName}
        </Heading>
        <ShopStatusBadges shop={model.selectedShop} />
      </HStack>
    );
  }

  return (
    <Box flex={1} minW={0}>
      <VisuallyHidden as="h1">{model.selectedShop.shopName}</VisuallyHidden>
      <Menu.Root positioning={{ placement: "bottom-start", gutter: 8 }}>
        <Menu.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`店舗を切り替える。現在は${model.selectedShop.shopName}`}
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            gap={3}
            w="full"
            minW={0}
            minH={{ base: "48px", md: "56px" }}
            h="auto"
            px={{ base: 3, md: 4 }}
            py={2.5}
            borderColor="gray.300"
            borderRadius="lg"
            color="gray.900"
            cursor="pointer"
            _hover={{ bg: "gray.50", borderColor: "gray.400" }}
          >
            <HStack gap={2} minW={0} textAlign="left">
              <Text textStyle={{ base: "sectionTitle", md: "pageTitle" }} fontWeight="bold" truncate minW={0}>
                {model.selectedShop.shopName}
              </Text>
              <ShopStatusBadges shop={model.selectedShop} />
            </HStack>
            <Icon as={LuChevronDown} boxSize={5} color="gray.500" flexShrink={0} />
          </Button>
        </Menu.Trigger>

        <Portal>
          <Menu.Positioner>
            <Menu.Content w="min(340px, calc(100vw - 24px))" maxH="min(520px, calc(100dvh - 96px))" overflowY="auto">
              {model.groups.map((group, groupIndex) => (
                <Box key={group.key}>
                  {model.hasMultipleGroups && groupIndex > 0 && <Menu.Separator />}
                  <Menu.ItemGroup>
                    {model.hasMultipleGroups && (
                      <Menu.ItemGroupLabel px={3} pt={2.5} pb={1} fontSize="xs" color="fg.muted" fontWeight="bold">
                        {group.organizationName}
                      </Menu.ItemGroupLabel>
                    )}
                    {group.shops.map((shop) => {
                      const isSelected = shop.shopId === model.selectedShop.shopId;
                      return (
                        <Menu.Item
                          key={shop.shopId}
                          value={`shop-${shop.shopId}`}
                          aria-current={isSelected ? "true" : undefined}
                          cursor="pointer"
                          px={3}
                          py={2.5}
                          onClick={() => onSelect(shop.shopId)}
                        >
                          <HStack w="full" gap={2.5} minW={0}>
                            <Box w="18px" color="teal.600" flexShrink={0}>
                              {isSelected && <LuCheck aria-hidden />}
                            </Box>
                            <HStack gap={2} flex={1} minW={0}>
                              <Text fontSize="sm" fontWeight={isSelected ? "bold" : "medium"} truncate minW={0}>
                                {shop.shopName}
                              </Text>
                              <ShopStatusBadges shop={shop} />
                            </HStack>
                          </HStack>
                        </Menu.Item>
                      );
                    })}
                  </Menu.ItemGroup>
                </Box>
              ))}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Box>
  );
};

const ShopStatusBadges = ({ shop }: { shop: ShopContextOption }) => {
  if (shop.shopStatus === "active" && shop.memberStatus !== "readOnly") return null;

  return (
    <HStack gap={1} flexShrink={0}>
      {shop.shopStatus === "planSuspended" && (
        <Badge colorPalette="orange" variant="subtle" size="sm">
          プラン停止中
        </Badge>
      )}
      {shop.shopStatus === "archived" && (
        <Badge colorPalette="gray" variant="subtle" size="sm">
          アーカイブ済み
        </Badge>
      )}
      {shop.memberStatus === "readOnly" && (
        <Badge colorPalette="gray" variant="subtle" size="sm">
          閲覧のみ
        </Badge>
      )}
    </HStack>
  );
};

export const OperationContextSkeleton = () => (
  <Stack
    gap={3}
    pb={{ base: 4, lg: 6 }}
    borderBottomWidth="1px"
    borderColor="gray.200"
    aria-label="現在の店舗を読み込み中"
  >
    <Flex justify="flex-end">
      <Skeleton h="32px" w="120px" />
    </Flex>
    <Flex align="center" justify="space-between" gap={3}>
      <Skeleton h={{ base: "28px", md: "40px" }} w={{ base: "160px", md: "240px" }} maxW="60%" />
      <Skeleton h="44px" w="44px" flexShrink={0} />
    </Flex>
  </Stack>
);
