import { Badge, Box, Heading, HStack, Icon, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight, LuBuilding2, LuStore } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { groupShopsByOrganization, type ShopContextOption } from "@/src/stores/shop";

export type ShopSelectionViewProps = {
  shops: readonly ShopContextOption[];
  selectedShopId?: string | null;
  onSelect: (shop: ShopContextOption) => void;
};

export const ShopSelectionView = ({ shops, selectedShopId = null, onSelect }: ShopSelectionViewProps) => {
  const groups = groupShopsByOrganization(shops);

  return (
    <Stack gap={{ base: 6, md: 8 }}>
      <Stack gap={2}>
        <HStack gap={2} color="teal.700">
          <Icon as={LuBuilding2} boxSize={5} />
          <Text fontSize="sm" fontWeight="bold">
            事業者・店舗の選択
          </Text>
        </HStack>
        <Heading as="h1" fontSize={{ base: "2xl", md: "3xl" }} color="gray.900">
          操作する店舗を選んでください
        </Heading>
        <Text color="fg.muted" lineHeight="tall">
          店舗を選ぶと、その店舗が所属する事業者の利用者・プラン・設定へ文脈が切り替わります。
        </Text>
      </Stack>

      <Stack gap={7}>
        {groups.map((group) => (
          <Box as="section" key={group.key} aria-labelledby={`organization-${group.key}`}>
            <HStack mb={3} gap={2}>
              <Icon as={LuBuilding2} color="gray.500" />
              <Heading id={`organization-${group.key}`} as="h2" fontSize="md" color="gray.800">
                {group.organizationName}
              </Heading>
            </HStack>
            <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
              {group.shops.map((shop) => {
                const isSelected = shop.shopId === selectedShopId;
                return (
                  <Button
                    key={shop.shopId}
                    variant="outline"
                    h="auto"
                    minH="88px"
                    p={4}
                    justifyContent="flex-start"
                    textAlign="left"
                    borderColor={isSelected ? "teal.500" : "gray.200"}
                    bg={isSelected ? "teal.50" : "white"}
                    _hover={{ borderColor: "teal.400", bg: "teal.50" }}
                    onClick={() => onSelect(shop)}
                    aria-label={`${shop.shopName}を選択`}
                  >
                    <HStack w="full" gap={3}>
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        boxSize="42px"
                        borderRadius="lg"
                        bg="teal.100"
                        color="teal.700"
                        flexShrink={0}
                      >
                        <LuStore aria-hidden />
                      </Box>
                      <Stack flex={1} minW={0} gap={1.5}>
                        <HStack gap={2} wrap="wrap">
                          <Text fontWeight="bold" color="gray.900" truncate>
                            {shop.shopName}
                          </Text>
                          {isSelected && (
                            <Badge colorPalette="teal" variant="solid" size="sm">
                              選択中
                            </Badge>
                          )}
                        </HStack>
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
                          {shop.shopStatus === "active" && shop.memberStatus === "active" && (
                            <Text fontSize="xs" color="fg.muted">
                              稼働中
                            </Text>
                          )}
                        </HStack>
                      </Stack>
                      <Icon as={LuArrowRight} color="gray.400" flexShrink={0} />
                    </HStack>
                  </Button>
                );
              })}
            </SimpleGrid>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
};
