import {
  Accordion,
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
import { useEffect, useRef, useState } from "react";
import { LuBuilding2, LuCheck, LuChevronDown, LuChevronRight, LuSettings, LuStore } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Tooltip } from "@/src/components/ui/tooltip";
import type { ShopContextOption } from "@/src/domains/shop/context";
import {
  getPlanStatusPresentation,
  PlanStatusCard,
  type PlanStatusCardAction,
  type PlanStatusCardData,
  type PlanStatusCardProps,
} from "../PlanStatusCard";
import type { OperationContextModel } from "./script";

const ORGANIZATION_DETAILS_VALUE = "organization-details";

export type OperationContextViewProps = {
  model: OperationContextModel;
  onShopSelect: (shopId: string) => void;
  organizationChangeOptions?: readonly OperationContextOrganizationChangeOption[];
  onOrganizationChange?: (targetId: string) => void;
  onOpenShopDetail: () => void;
  onOpenOrganizationSettings?: () => void;
  planStatusCard?: PlanStatusCardProps | null;
  billingSettingsShopId?: string;
  showPageHeading?: boolean;
  showOrganizationContext?: boolean;
  showShopContext?: boolean;
};

export type OperationContextOrganizationChangeOption = {
  key: string;
  organizationName: string;
  targetId: string;
};

export const OperationContextView = ({
  model,
  onShopSelect,
  organizationChangeOptions,
  onOrganizationChange,
  onOpenShopDetail,
  onOpenOrganizationSettings,
  planStatusCard,
  billingSettingsShopId,
  showPageHeading = true,
  showOrganizationContext = true,
  showShopContext = true,
}: OperationContextViewProps) => {
  const defaultExpanded = planStatusCard?.defaultExpanded ?? false;
  const [value, setValue] = useState<string[]>(defaultExpanded ? [ORGANIZATION_DETAILS_VALUE] : []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousDefaultExpanded = useRef(defaultExpanded);
  const previousHasPlanDetails = useRef(Boolean(planStatusCard));
  const isExpanded = value.includes(ORGANIZATION_DETAILS_VALUE);
  const resolvedOrganizationChangeOptions =
    organizationChangeOptions ??
    model.organizationChangeOptions.map((option) => ({
      key: option.key,
      organizationName: option.organizationName,
      targetId: option.shopId,
    }));
  const handleOrganizationChange = onOrganizationChange ?? onShopSelect;
  const hasOrganizationSettingsAction = onOpenOrganizationSettings !== undefined;
  const hasAccordionContent = Boolean(
    hasOrganizationSettingsAction || planStatusCard || resolvedOrganizationChangeOptions.length > 0,
  );
  const presentation = planStatusCard ? getPlanStatusPresentation(planStatusCard.data) : null;
  const billingAction = planStatusCard ? getBillingAction(planStatusCard.data) : null;

  useEffect(() => {
    if (!previousDefaultExpanded.current && defaultExpanded) setValue([ORGANIZATION_DETAILS_VALUE]);
    previousDefaultExpanded.current = defaultExpanded;
  }, [defaultExpanded]);

  useEffect(() => {
    const hadPlanDetails = previousHasPlanDetails.current;
    if (!hadPlanDetails && planStatusCard && isExpanded) planStatusCard.onExpandedChange?.(true);
    previousHasPlanDetails.current = Boolean(planStatusCard);
  }, [isExpanded, planStatusCard]);

  const updateExpanded = (expanded: boolean) => {
    setValue(expanded ? [ORGANIZATION_DETAILS_VALUE] : []);
    planStatusCard?.onExpandedChange?.(expanded);
  };

  const handleRequestCollapse = () => {
    updateExpanded(false);
    triggerRef.current?.focus();
  };

  return (
    <Stack gap={{ base: 2, lg: 3 }}>
      {showPageHeading && <VisuallyHidden as="h1">{model.selectedShop.shopName}</VisuallyHidden>}

      {showOrganizationContext &&
        (hasAccordionContent ? (
          <Accordion.Root
            collapsible
            variant="plain"
            colorPalette="gray"
            value={value}
            onValueChange={(details) => updateExpanded(details.value.includes(ORGANIZATION_DETAILS_VALUE))}
          >
            <Accordion.Item
              value={ORGANIZATION_DETAILS_VALUE}
              borderWidth="1px"
              borderColor="gray.300"
              borderRadius="lg"
              bg="white"
              overflow="hidden"
            >
              <Heading as="h2" fontSize="inherit" fontWeight="normal">
                <Accordion.ItemTrigger
                  ref={triggerRef}
                  minH={{ base: "48px", md: "56px" }}
                  px={{ base: 3, md: 4 }}
                  py={2.5}
                  borderRadius="0"
                  cursor="pointer"
                  _hover={{ bg: "gray.50" }}
                  _focusVisible={{
                    outline: "2px solid",
                    outlineColor: "teal.700",
                    outlineOffset: "-2px",
                  }}
                >
                  <OrganizationSummary model={model} presentation={presentation} />
                  <Accordion.ItemIndicator color="fg.muted" flexShrink={0} />
                </Accordion.ItemTrigger>
              </Heading>

              <Accordion.ItemContent borderTopWidth="1px" borderTopColor="gray.200">
                <Accordion.ItemBody p={0}>
                  {planStatusCard && (
                    <PlanStatusCard
                      key={billingSettingsShopId ?? model.selectedShop.shopId}
                      {...planStatusCard}
                      onRequestCollapse={handleRequestCollapse}
                    />
                  )}
                  {hasOrganizationSettingsAction && (
                    <OrganizationSettingsAction
                      organizationName={model.selectedGroup.organizationName}
                      onOpen={onOpenOrganizationSettings}
                      withBorder={Boolean(planStatusCard)}
                    />
                  )}
                  {planStatusCard && billingAction && (
                    <PlanAndPaymentLink
                      label={billingAction.label}
                      onOpen={() => planStatusCard.onAction(billingAction.action)}
                    />
                  )}
                  {resolvedOrganizationChangeOptions.map((option, index) => (
                    <OrganizationChangeButton
                      key={option.key}
                      organizationName={option.organizationName}
                      targetId={option.targetId}
                      withBorder={Boolean(planStatusCard || onOpenOrganizationSettings || index > 0)}
                      onSelect={handleOrganizationChange}
                    />
                  ))}
                </Accordion.ItemBody>
              </Accordion.ItemContent>
            </Accordion.Item>
          </Accordion.Root>
        ) : (
          <Box borderWidth="1px" borderColor="gray.300" borderRadius="lg" bg="white">
            <Heading as="h2" fontSize="inherit" fontWeight="normal" minH={{ base: "48px", md: "56px" }}>
              <Flex as="span" align="center" h="full" minH="inherit" px={{ base: 3, md: 4 }} py={2.5}>
                <OrganizationSummary model={model} />
              </Flex>
            </Heading>
          </Box>
        ))}

      {showShopContext && (
        <Flex align="center" justify="space-between" direction="row" gap={3} minW={0}>
          <ShopSelector model={model} onSelect={onShopSelect} />
          <ShopDetailButton onOpenShopDetail={onOpenShopDetail} />
        </Flex>
      )}
    </Stack>
  );
};

const OrganizationSummary = ({
  model,
  presentation,
}: {
  model: OperationContextModel;
  presentation?: PlanPresentation | null;
}) => {
  return (
    <Stack as="span" flex={1} minW={0} gap={presentation?.summaryBadge ? 1 : 0} textAlign="left">
      <Text as="span" ps={7} fontSize="xs" lineHeight="short" color="fg.muted">
        組織・プラン
      </Text>
      <HStack as="span" minW={0} gap={2}>
        <Flex as="span" boxSize="20px" flexShrink={0} align="center" justify="center" color="gray.600">
          <LuBuilding2 aria-hidden size={20} />
        </Flex>
        <Text as="span" flex={1} minW={0} fontSize="lg" lineHeight="20px" fontWeight="bold" color="gray.900" truncate>
          {model.selectedGroup.organizationName}
        </Text>
        {presentation?.summaryBadge && (
          <Badge
            variant="subtle"
            borderRadius="full"
            px={2.5}
            py={1}
            bg={presentation.summaryBadge.background}
            color={presentation.summaryBadge.color}
          >
            {presentation.summaryBadge.label}
          </Badge>
        )}
      </HStack>
    </Stack>
  );
};

type PlanPresentation = ReturnType<typeof getPlanStatusPresentation>;

type BillingAction = {
  action: PlanStatusCardAction;
  label: string;
};

const getBillingAction = (data: PlanStatusCardData): BillingAction => {
  if ("primaryAction" in data && data.primaryAction) return data.primaryAction;
  return { action: "openPlanAndPayment", label: "プランと支払いへ" };
};

const OrganizationSettingsAction = ({
  organizationName,
  onOpen,
  withBorder,
}: {
  organizationName: string;
  onOpen: () => void;
  withBorder: boolean;
}) => {
  const content = (
    <>
      <Text as="span" flex={1} textAlign="left">
        組織情報を見る
      </Text>
      <Icon as={LuChevronRight} boxSize={5} color="fg.muted" flexShrink={0} />
    </>
  );
  const buttonProps = {
    variant: "plain" as const,
    justifyContent: "flex-start",
    w: "full",
    minH: "52px",
    h: "auto",
    px: { base: 4, md: 5 },
    py: 3,
    borderTopWidth: withBorder ? "1px" : 0,
    borderTopColor: "gray.200",
    borderRadius: "0",
    color: "gray.900",
    fontSize: "md",
    fontWeight: "medium",
    _hover: {
      bg: "gray.50",
      color: "teal.700",
      textDecoration: "underline",
      textDecorationColor: "teal.700",
      textUnderlineOffset: "3px",
    },
  };

  return (
    <Button type="button" aria-label={`${organizationName}の組織設定を開く`} {...buttonProps} onClick={onOpen}>
      {content}
    </Button>
  );
};

const PlanAndPaymentLink = ({ label, onOpen }: { label: string; onOpen: () => void }) => (
  <Button
    type="button"
    variant="plain"
    justifyContent="flex-start"
    w="full"
    minH="52px"
    h="auto"
    px={{ base: 4, md: 5 }}
    py={3}
    borderTopWidth="1px"
    borderTopColor="gray.200"
    borderRadius="0"
    color="gray.900"
    fontSize="md"
    fontWeight="medium"
    _hover={{
      bg: "gray.50",
      color: "teal.700",
      textDecoration: "underline",
      textDecorationColor: "teal.700",
      textUnderlineOffset: "3px",
    }}
    onClick={onOpen}
  >
    <Text as="span" flex={1} textAlign="left">
      {label}
    </Text>
    <Icon as={LuChevronRight} boxSize={5} color="fg.muted" flexShrink={0} />
  </Button>
);

const OrganizationChangeButton = ({
  organizationName,
  targetId,
  withBorder,
  onSelect,
}: {
  organizationName: string;
  targetId: string;
  withBorder: boolean;
  onSelect: (targetId: string) => void;
}) => (
  <Button
    type="button"
    variant="plain"
    justifyContent="flex-start"
    w="full"
    minH="52px"
    h="auto"
    px={{ base: 4, md: 5 }}
    py={3}
    borderTopWidth={withBorder ? "1px" : 0}
    borderTopColor="gray.200"
    borderRadius="0"
    color="gray.900"
    fontSize="md"
    fontWeight="medium"
    _hover={{
      bg: "gray.50",
      color: "teal.700",
      textDecoration: "underline",
      textDecorationColor: "teal.700",
      textUnderlineOffset: "3px",
    }}
    onClick={() => onSelect(targetId)}
  >
    <Text as="span" flex={1} minW={0} textAlign="left" lineHeight="short" whiteSpace="normal" overflowWrap="anywhere">
      組織を変更：{organizationName}
    </Text>
    <Icon as={LuChevronRight} boxSize={5} color="fg.muted" flexShrink={0} />
  </Button>
);

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
          <ShopStatusBadges shop={model.selectedShop} />
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
                <ShopStatusBadges shop={model.selectedShop} />
              </HStack>
            </Stack>
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
  if (shop.shopStatus === "active") return null;

  return (
    <HStack gap={1} flexShrink={0}>
      {shop.shopStatus === "archived" && (
        <Badge colorPalette="gray" variant="subtle" size="sm">
          アーカイブ済み
        </Badge>
      )}
    </HStack>
  );
};

export const OperationContextSkeleton = ({
  showOrganizationContext = true,
}: {
  showOrganizationContext?: boolean;
} = {}) => (
  <Stack
    gap={{ base: 2, lg: 3 }}
    aria-label={showOrganizationContext ? "現在の組織と店舗を読み込み中" : "現在の店舗を読み込み中"}
  >
    {showOrganizationContext && (
      <Flex
        align="center"
        gap={3}
        minH={{ base: "48px", md: "56px" }}
        px={{ base: 3, md: 4 }}
        py={2.5}
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
        <Skeleton boxSize="20px" flexShrink={0} />
      </Flex>
    )}
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
