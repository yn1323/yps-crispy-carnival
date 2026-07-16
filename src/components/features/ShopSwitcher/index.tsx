import { Badge, Box, HStack, Icon, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { LuCheck, LuChevronDown, LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import {
  groupShopsByOrganization,
  isSelectableShop,
  normalizeShopContextOptions,
  type ShopContextOption,
  selectedShopAtom,
  toSelectedShop,
} from "@/src/stores/shop";

export const ShopSwitcher = () => {
  const navigate = useNavigate();
  const rawShops = useQuery(api.dashboard.queries.getMyShops, {});
  const [selectedShop, setSelectedShop] = useAtom(selectedShopAtom);

  if (rawShops === undefined) return null;

  const shops = normalizeShopContextOptions(rawShops).filter(isSelectableShop);
  if (shops.length === 0) return null;

  const handleSelect = (shop: ShopContextOption) => {
    setSelectedShop(toSelectedShop(shop));
    void navigate({ to: "/dashboard", replace: true });
  };

  return <ShopSwitcherView shops={shops} selectedShopId={selectedShop?.shopId ?? null} onSelect={handleSelect} />;
};

export type ShopSwitcherViewProps = {
  shops: readonly ShopContextOption[];
  selectedShopId: string | null;
  onSelect: (shop: ShopContextOption) => void;
};

export const ShopSwitcherView = ({ shops, selectedShopId, onSelect }: ShopSwitcherViewProps) => {
  const selectableShops = shops.filter(isSelectableShop);
  const selectedShop = selectableShops.find((shop) => shop.shopId === selectedShopId) ?? null;
  const groups = groupShopsByOrganization(selectableShops);

  if (selectableShops.length === 0) return null;

  const currentContextLabel = selectedShop
    ? `${selectedShop.organizationName ?? "所属事業者"}、${selectedShop.shopName}`
    : "店舗未選択";

  return (
    <Menu.Root positioning={{ placement: "bottom-end", gutter: 8 }}>
      <Menu.Trigger asChild>
        <Box
          as="button"
          aria-label={`店舗を切り替える。現在は${currentContextLabel}`}
          display="flex"
          alignItems="center"
          gap={{ base: 0, md: 2 }}
          minW={0}
          maxW={{ base: "40px", md: "240px" }}
          h={{ base: 10, md: 11 }}
          px={{ base: 2.5, md: 3 }}
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="lg"
          bg="white"
          color="gray.800"
          cursor="pointer"
          _hover={{ bg: "gray.50", borderColor: "gray.300" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.500", outlineOffset: "2px" }}
        >
          <Icon as={LuStore} boxSize={5} color="teal.600" flexShrink={0} />
          <Box display={{ base: "none", md: "block" }} minW={0} textAlign="left" flex={1}>
            <Text fontSize="xs" color="fg.muted" truncate>
              {selectedShop?.organizationName ?? "事業者・店舗を選択"}
            </Text>
            <Text fontSize="sm" fontWeight="semibold" truncate>
              {selectedShop?.shopName ?? "店舗を選ぶ"}
            </Text>
          </Box>
          <Icon
            as={LuChevronDown}
            display={{ base: "none", md: "block" }}
            boxSize={4}
            color="gray.500"
            flexShrink={0}
          />
        </Box>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(340px, calc(100vw - 24px))" maxH="min(520px, calc(100dvh - 96px))" overflowY="auto">
            <Box px={3} pt={3} pb={2}>
              <Text fontSize="sm" fontWeight="bold" color="gray.900">
                操作する店舗を選択
              </Text>
              <Text mt={0.5} fontSize="xs" color="fg.muted">
                店舗を選ぶと事業者の文脈も切り替わります。
              </Text>
            </Box>
            <Menu.Separator />

            {groups.map((group, groupIndex) => (
              <Box key={group.key}>
                {groupIndex > 0 && <Menu.Separator />}
                <Menu.ItemGroup>
                  <Menu.ItemGroupLabel px={3} pt={2.5} pb={1} fontSize="xs" color="fg.muted" fontWeight="bold">
                    {group.organizationName}
                  </Menu.ItemGroupLabel>
                  {group.shops.map((shop) => {
                    const isSelected = shop.shopId === selectedShopId;
                    return (
                      <Menu.Item
                        key={shop.shopId}
                        value={`shop-${shop.shopId}`}
                        onClick={() => onSelect(shop)}
                        cursor="pointer"
                        px={3}
                        py={2.5}
                      >
                        <HStack w="full" gap={2.5} align="center">
                          <Box w="18px" color="teal.600" flexShrink={0}>
                            {isSelected && <LuCheck aria-hidden />}
                          </Box>
                          <Stack gap={1} flex={1} minW={0}>
                            <Text fontSize="sm" fontWeight={isSelected ? "bold" : "medium"} truncate>
                              {shop.shopName}
                            </Text>
                            {(shop.shopStatus !== "active" || shop.memberStatus === "readOnly") && (
                              <HStack gap={1.5} wrap="wrap">
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
                            )}
                          </Stack>
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
  );
};
