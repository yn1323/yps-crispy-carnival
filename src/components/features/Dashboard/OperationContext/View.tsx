import { Badge, Box, Heading, HStack, Icon, Menu, Portal, SimpleGrid, Skeleton, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import type { ElementType, ReactNode } from "react";
import { LuBuilding2, LuCheck, LuChevronDown, LuSettings, LuStore } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";
import type { ShopContextOption } from "@/src/stores/shop";
import type { OperationContextModel } from "./script";

type SelectorOption = {
  key: string;
  label: string;
  badges?: ReactNode;
};

export type OperationContextViewProps = {
  model: OperationContextModel;
  isReadOnly?: boolean;
  groupSettingsShopId: string;
  onGroupSelect: (groupKey: string) => void;
  onShopSelect: (shopId: string) => void;
  onOpenShopSettings: () => void;
};

export const OperationContextView = ({
  model,
  isReadOnly = false,
  groupSettingsShopId,
  onGroupSelect,
  onShopSelect,
  onOpenShopSettings,
}: OperationContextViewProps) => {
  const groupOptions = model.groups.map((group) => ({
    key: group.key,
    label: group.organizationName,
  }));
  const shopOptions = model.selectedGroup.shops.map((shop) => ({
    key: shop.shopId,
    label: shop.shopName,
    badges: <ShopStatusBadges shop={shop} />,
  }));
  const readOnlyReason = "閲覧のみの店舗では設定を変更できません";

  return (
    <Stack gap={3}>
      <Heading as="h1" textStyle="sectionTitle" color="gray.900">
        現在の操作先
      </Heading>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
        <ContextSelector
          kind="グループ"
          value={model.selectedGroup.organizationName}
          icon={LuBuilding2}
          canSwitch={model.canSwitchGroup}
          options={groupOptions}
          selectedKey={model.selectedGroup.key}
          onSelect={onGroupSelect}
          settingsAction={
            <Tooltip content={`${model.selectedGroup.organizationName}のグループ設定を開く`}>
              <IconButton
                asChild
                variant="ghost"
                colorPalette="teal"
                minW="44px"
                minH="44px"
                aria-label={`${model.selectedGroup.organizationName}のグループ設定を開く`}
              >
                <RouterLink to="/settings" search={{ shop: groupSettingsShopId }}>
                  <LuSettings aria-hidden />
                </RouterLink>
              </IconButton>
            </Tooltip>
          }
        />

        <ContextSelector
          kind="店舗"
          value={model.selectedShop.shopName}
          icon={LuStore}
          canSwitch={model.canSwitchShop}
          options={shopOptions}
          selectedKey={model.selectedShop.shopId}
          onSelect={onShopSelect}
          valueBadges={<ShopStatusBadges shop={model.selectedShop} />}
          settingsAction={
            <Tooltip content={isReadOnly ? readOnlyReason : `${model.selectedShop.shopName}の店舗設定を編集`}>
              <Box as="span" display="inline-flex">
                <IconButton
                  variant="ghost"
                  colorPalette="teal"
                  minW="44px"
                  minH="44px"
                  aria-label={`${model.selectedShop.shopName}の店舗設定を編集`}
                  disabled={isReadOnly}
                  title={isReadOnly ? readOnlyReason : undefined}
                  onClick={onOpenShopSettings}
                >
                  <LuSettings aria-hidden />
                </IconButton>
              </Box>
            </Tooltip>
          }
        />
      </SimpleGrid>
    </Stack>
  );
};

type ContextSelectorProps = {
  kind: "グループ" | "店舗";
  value: string;
  icon: ElementType;
  canSwitch: boolean;
  options: SelectorOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  settingsAction: ReactNode;
  valueBadges?: ReactNode;
};

const ContextSelector = ({
  kind,
  value,
  icon,
  canSwitch,
  options,
  selectedKey,
  onSelect,
  settingsAction,
  valueBadges,
}: ContextSelectorProps) => {
  const selectorContent = (
    <HStack gap={3} minW={0} w="full">
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        boxSize="40px"
        borderRadius="lg"
        bg="teal.50"
        color="teal.700"
        flexShrink={0}
      >
        <Icon as={icon} boxSize={5} />
      </Box>
      <Stack gap={0.5} minW={0} flex={1} textAlign="left">
        <Text fontSize="xs" color="fg.muted" fontWeight="semibold">
          {kind}
        </Text>
        <HStack gap={2} minW={0}>
          <Text fontSize="md" fontWeight="bold" color="gray.900" truncate minW={0}>
            {value}
          </Text>
          {valueBadges}
        </HStack>
      </Stack>
      {canSwitch && <Icon as={LuChevronDown} boxSize={5} color="gray.500" flexShrink={0} />}
    </HStack>
  );

  const card = (selector: ReactNode) => (
    <HStack
      gap={0}
      minW={0}
      minH="72px"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="xl"
      bg="white"
      boxShadow="xs"
      overflow="hidden"
    >
      {selector}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        alignSelf="stretch"
        px={2}
        borderLeftWidth="1px"
        borderColor="gray.100"
        flexShrink={0}
      >
        {settingsAction}
      </Box>
    </HStack>
  );

  if (!canSwitch) {
    return card(
      <Box display="flex" alignItems="center" flex={1} minW={0} alignSelf="stretch" px={4} py={3}>
        {selectorContent}
      </Box>,
    );
  }

  return (
    <Menu.Root positioning={{ placement: "bottom-start", gutter: 8 }}>
      {card(
        <Menu.Trigger asChild>
          <Button
            type="button"
            variant="plain"
            aria-label={`${kind}を切り替える。現在は${value}`}
            display="flex"
            alignItems="center"
            flex={1}
            minW={0}
            minH="72px"
            h="auto"
            alignSelf="stretch"
            px={4}
            py={3}
            cursor="pointer"
            _hover={{ bg: "gray.50" }}
            _focusVisible={{ outline: "2px solid", outlineColor: "teal.500", outlineOffset: "-2px" }}
          >
            {selectorContent}
          </Button>
        </Menu.Trigger>,
      )}

      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(320px, calc(100vw - 24px))" maxH="min(420px, calc(100dvh - 96px))" overflowY="auto">
            {options.map((option) => {
              const isSelected = option.key === selectedKey;
              return (
                <Menu.Item
                  key={option.key}
                  value={`${kind}-${option.key}`}
                  aria-current={isSelected ? "true" : undefined}
                  cursor="pointer"
                  px={3}
                  py={2.5}
                  onClick={() => onSelect(option.key)}
                >
                  <HStack w="full" gap={2.5} minW={0}>
                    <Box w="18px" color="teal.600" flexShrink={0}>
                      {isSelected && <LuCheck aria-hidden />}
                    </Box>
                    <HStack gap={2} flex={1} minW={0}>
                      <Text fontSize="sm" fontWeight={isSelected ? "bold" : "medium"} truncate minW={0}>
                        {option.label}
                      </Text>
                      {option.badges}
                    </HStack>
                  </HStack>
                </Menu.Item>
              );
            })}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
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
  <Stack gap={3} aria-label="現在の操作先を読み込み中">
    <Skeleton h="26px" w="144px" />
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      {["group", "shop"].map((key) => (
        <Skeleton key={key} h="72px" borderRadius="xl" />
      ))}
    </SimpleGrid>
  </Stack>
);
