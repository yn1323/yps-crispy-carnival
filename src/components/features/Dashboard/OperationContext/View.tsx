import { Box, Flex, HStack, Icon, Menu, Portal, Skeleton, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuCheck, LuChevronDown, LuSettings, LuStore } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";
import type { OperationContextModel } from "./script";

export type OperationContextViewProps = {
  model: OperationContextModel;
  onShopSelect: (shopId: string) => void;
  onOpenShopDetail: () => void;
};

export const OperationContextView = ({ model, onShopSelect, onOpenShopDetail }: OperationContextViewProps) => {
  return (
    <Stack gap={{ base: 2, lg: 3 }}>
      <VisuallyHidden as="h1">{model.selectedShop.shopName}</VisuallyHidden>
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
      <Stack
        gap={0}
        flex={1}
        minW={0}
        minH={{ base: "48px", md: "56px" }}
        px={{ base: 3, md: 4 }}
        py={2.5}
        textAlign="left"
      >
        <Text as="span" ps={7} fontSize="xs" lineHeight="short" color="fg.muted">
          店舗
        </Text>
        <HStack as="span" gap={2} minW={0}>
          <Icon as={LuStore} boxSize={5} color="gray.700" flexShrink={0} aria-hidden />
          <Text as="span" flex={1} minW={0} fontSize="lg" fontWeight="bold" color="gray.900" truncate>
            {model.selectedShop.shopName}
          </Text>
        </HStack>
      </Stack>
    );
  }

  return (
    <Box flex={1} minW={0}>
      <Menu.Root positioning={{ placement: "bottom-start", gutter: 8 }}>
        <Menu.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`店舗を切り替える（現在：${model.selectedShop.shopName}）`}
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
            <Stack gap={0} flex={1} minW={0} textAlign="left">
              <Text as="span" ps={7} fontSize="xs" lineHeight="short" color="fg.muted">
                店舗
              </Text>
              <HStack as="span" gap={2} minW={0}>
                <Icon as={LuStore} boxSize={5} color="gray.700" flexShrink={0} aria-hidden />
                <Text as="span" flex={1} minW={0} fontSize="lg" fontWeight="bold" truncate>
                  {model.selectedShop.shopName}
                </Text>
              </HStack>
            </Stack>
            <Icon as={LuChevronDown} boxSize={5} color="gray.500" flexShrink={0} />
          </Button>
        </Menu.Trigger>

        <Portal>
          <Menu.Positioner>
            <Menu.Content w="min(340px, calc(100vw - 24px))" maxH="min(520px, calc(100dvh - 96px))" overflowY="auto">
              <Menu.ItemGroup>
                {model.selectedGroup.shops.map((shop) => {
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
                        </HStack>
                      </HStack>
                    </Menu.Item>
                  );
                })}
              </Menu.ItemGroup>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Box>
  );
};

export const OperationContextSkeleton = () => (
  <Stack gap={{ base: 2, lg: 3 }} aria-label="現在の店舗を読み込み中">
    <Flex align="center" justify="space-between" gap={3}>
      <Flex
        align="center"
        gap={2}
        flex={1}
        minW={0}
        minH="64px"
        px={{ base: 3, md: 4 }}
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        bg="white"
      >
        <Stack flex={1} minW={0} gap={1}>
          <Skeleton h="12px" w={{ base: "44px", md: "56px" }} ms={7} />
          <HStack gap={2}>
            <Skeleton boxSize="20px" borderRadius="sm" flexShrink={0} />
            <Skeleton h="22px" w={{ base: "140px", md: "220px" }} maxW="70%" />
          </HStack>
        </Stack>
      </Flex>
      <Skeleton h="44px" w="44px" flexShrink={0} />
    </Flex>
  </Stack>
);
