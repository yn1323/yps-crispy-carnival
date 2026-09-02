import { Badge, Box, Flex, HStack, Icon, Link, Menu, Portal, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { type SyntheticEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  LuBellOff,
  LuCalendarClock,
  LuCalendarDays,
  LuCheck,
  LuClock3,
  LuEllipsis,
  LuMail,
  LuShieldAlert,
  LuStore,
  LuUserRoundPlus,
  LuUsers,
} from "react-icons/lu";
import { Button, type ButtonProps, IconButton } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import type {
  ActionInboxAction,
  ActionInboxActionContext,
  ActionInboxCategory,
  ActionInboxItem,
  ActionInboxItemCategory,
  ActionInboxMetadataItem,
} from "./types";

type ActionInboxItemVariant = "card" | "list";

type Props = {
  items: readonly ActionInboxItem[];
  completedItemId?: string | null;
  completedItemIds?: readonly string[];
  ariaLabel?: string;
  hideEmpty?: boolean;
  itemVariant?: ActionInboxItemVariant;
  onVisibleItemCountChange?: (count: number) => void;
  /** @deprecated 少量の対応項目を一つの一覧で扱うため、種類フィルターは表示しません。 */
  activeCategory?: ActionInboxCategory;
  /** @deprecated 少量の対応項目を一つの一覧で扱うため、種類フィルターは表示しません。 */
  onCategoryChange?: (category: ActionInboxCategory) => void;
};

type CategoryPresentation = {
  icon: IconType;
  colorPalette: "orange" | "teal" | "red" | "purple";
};

const CATEGORY_PRESENTATION: Record<ActionInboxItemCategory, CategoryPresentation> = {
  shift: {
    icon: LuCalendarClock,
    colorPalette: "orange",
  },
  staff: {
    icon: LuUserRoundPlus,
    colorPalette: "teal",
  },
  notification: {
    icon: LuBellOff,
    colorPalette: "red",
  },
  management: {
    icon: LuShieldAlert,
    colorPalette: "purple",
  },
};

const EXIT_DURATION_MS = 240;
const EMPTY_COMPLETED_ITEM_IDS: readonly string[] = [];
const preventInteraction = (event: SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function ActionInboxView({
  items,
  completedItemId,
  completedItemIds = EMPTY_COMPLETED_ITEM_IDS,
  ariaLabel = "要対応の項目",
  hideEmpty = false,
  itemVariant = "card",
  onVisibleItemCountChange,
}: Props) {
  const [exitingItemIds, setExitingItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [dismissedItemIds, setDismissedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [retainedItems, setRetainedItems] = useState<ReadonlyMap<string, { item: ActionInboxItem; index: number }>>(
    () => new Map(),
  );
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ key: string; message: string } | null>(null);
  const [completionAnnouncement, setCompletionAnnouncement] = useState("");
  const exitTimersRef = useRef<Map<string, number>>(new Map());
  const runningActionKeyRef = useRef<string | null>(null);
  const currentItemIdsRef = useRef<ReadonlySet<string>>(new Set());
  const itemSnapshotsRef = useRef(new Map<string, { item: ActionInboxItem; index: number }>());
  const requestedCompletionCountsRef = useRef<ReadonlyMap<string, number>>(new Map());
  const requestedCompletionCounts = useMemo(
    () => countCompletionRequests(completedItemId, completedItemIds),
    [completedItemId, completedItemIds],
  );
  currentItemIdsRef.current = new Set(items.map((item) => item.id));
  for (const [index, item] of items.entries()) itemSnapshotsRef.current.set(item.id, { item, index });
  const completionRetainedItems = new Map(retainedItems);
  for (const [itemId, count] of requestedCompletionCounts) {
    if (count <= (requestedCompletionCountsRef.current.get(itemId) ?? 0)) continue;
    const snapshot = itemSnapshotsRef.current.get(itemId);
    if (snapshot) completionRetainedItems.set(itemId, snapshot);
  }
  const renderedItems = mergeRetainedItems(items, completionRetainedItems);
  const visibleItems = renderedItems.filter((item) => !dismissedItemIds.has(item.id));
  const reportedVisibleItemIds = new Set(visibleItems.map((item) => item.id));
  for (const [itemId, count] of requestedCompletionCounts) {
    if (
      count > (requestedCompletionCountsRef.current.get(itemId) ?? 0) &&
      itemSnapshotsRef.current.has(itemId) &&
      !dismissedItemIds.has(itemId)
    ) {
      reportedVisibleItemIds.add(itemId);
    }
  }
  const reportedVisibleItemCount = reportedVisibleItemIds.size;

  const beginExit = useCallback((snapshot: { item: ActionInboxItem; index: number }, announcement: string) => {
    const { item, index } = snapshot;
    if (exitTimersRef.current.has(item.id)) return;

    setRetainedItems((current) => new Map(current).set(item.id, { item, index }));
    setExitingItemIds((current) => new Set(current).add(item.id));
    setCompletionAnnouncement(announcement);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timerId = window.setTimeout(
      () => {
        setDismissedItemIds((current) => {
          const next = new Set(current);
          if (currentItemIdsRef.current.has(item.id)) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
        setExitingItemIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        setRetainedItems((current) => {
          const next = new Map(current);
          next.delete(item.id);
          return next;
        });
        if (!currentItemIdsRef.current.has(item.id)) itemSnapshotsRef.current.delete(item.id);
        exitTimersRef.current.delete(item.id);
      },
      prefersReducedMotion ? 0 : EXIT_DURATION_MS,
    );
    exitTimersRef.current.set(item.id, timerId);
  }, []);

  useLayoutEffect(() => {
    for (const [itemId, count] of requestedCompletionCounts) {
      if (count <= (requestedCompletionCountsRef.current.get(itemId) ?? 0)) continue;
      const snapshot = itemSnapshotsRef.current.get(itemId);
      if (snapshot) beginExit(snapshot, "対応を完了しました。");
    }
    requestedCompletionCountsRef.current = requestedCompletionCounts;
  }, [beginExit, requestedCompletionCounts]);

  useEffect(() => {
    onVisibleItemCountChange?.(reportedVisibleItemCount);
  }, [onVisibleItemCountChange, reportedVisibleItemCount]);

  useEffect(
    () => () => {
      for (const timerId of exitTimersRef.current.values()) window.clearTimeout(timerId);
      exitTimersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const currentItemIds = new Set(items.map((item) => item.id));
    setDismissedItemIds((current) => {
      const retained = new Set([...current].filter((itemId) => currentItemIds.has(itemId)));
      return retained.size === current.size ? current : retained;
    });
    for (const itemId of itemSnapshotsRef.current.keys()) {
      if (!currentItemIds.has(itemId) && !retainedItems.has(itemId) && !exitTimersRef.current.has(itemId)) {
        itemSnapshotsRef.current.delete(itemId);
      }
    }
  }, [items, retainedItems]);

  const runAction = async (
    item: ActionInboxItem,
    action: ActionInboxAction,
    triggerElement?: ActionInboxActionContext["triggerElement"],
  ) => {
    if (action.disabled) return;

    const actionKey = `${item.id}:${action.label}`;
    if (runningActionKeyRef.current !== null) return;

    runningActionKeyRef.current = actionKey;
    setRunningActionKey(actionKey);
    setActionError(null);
    if (action.removesItemOnSuccess) {
      const itemIndex = renderedItems.findIndex((candidate) => candidate.id === item.id);
      const snapshot = { item, index: Math.max(0, itemIndex) };
      itemSnapshotsRef.current.set(item.id, snapshot);
      setRetainedItems((current) => new Map(current).set(item.id, snapshot));
    }
    try {
      await action.onClick(triggerElement ? { triggerElement } : undefined);
      if (!action.removesItemOnSuccess) return;

      const snapshot = itemSnapshotsRef.current.get(item.id);
      if (snapshot) beginExit(snapshot, action.successMessage);
    } catch {
      setRetainedItems((current) => {
        const next = new Map(current);
        next.delete(item.id);
        return next;
      });
      const message = action.failureMessage ?? `${action.label}を実行できませんでした。もう一度お試しください。`;
      setActionError({ key: actionKey, message });
      setCompletionAnnouncement(message);
    } finally {
      if (runningActionKeyRef.current === actionKey) runningActionKeyRef.current = null;
      setRunningActionKey((current) => (current === actionKey ? null : current));
    }
  };

  return (
    <Stack gap={0}>
      <VisuallyHidden aria-live="polite">{completionAnnouncement}</VisuallyHidden>
      {visibleItems.length === 0 ? (
        hideEmpty ? null : (
          <Empty icon={LuCheck} title="対応が必要な項目はありません" tone="brand" variant="section" />
        )
      ) : (
        <Stack as="section" aria-label={ariaLabel} gap={0}>
          {visibleItems.map((item, index) => (
            <Box
              key={item.id}
              display="grid"
              gridTemplateRows={exitingItemIds.has(item.id) ? "0fr" : "1fr"}
              pb={exitingItemIds.has(item.id) || itemVariant === "list" ? 0 : { base: 2, md: 3 }}
              transition={`grid-template-rows ${EXIT_DURATION_MS}ms ease, padding-bottom ${EXIT_DURATION_MS}ms ease`}
              _motionReduce={{ transition: "none" }}
            >
              <Box minH={0} overflow="hidden">
                <ActionCard
                  item={item}
                  itemVariant={itemVariant}
                  isFirst={index === 0}
                  isExiting={exitingItemIds.has(item.id)}
                  runningActionKey={runningActionKey}
                  actionError={actionError}
                  onRunAction={(action, triggerElement) => void runAction(item, action, triggerElement)}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function mergeRetainedItems(
  items: readonly ActionInboxItem[],
  retainedItems: ReadonlyMap<string, { item: ActionInboxItem; index: number }>,
) {
  const merged = [...items];
  const currentItemIds = new Set(items.map((item) => item.id));
  const missingItems = [...retainedItems.values()]
    .filter(({ item }) => !currentItemIds.has(item.id))
    .sort((left, right) => left.index - right.index);
  for (const retained of missingItems) {
    merged.splice(Math.min(retained.index, merged.length), 0, retained.item);
  }
  return merged;
}

function countCompletionRequests(completedItemId: string | null | undefined, completedItemIds: readonly string[]) {
  const counts = new Map<string, number>();
  for (const itemId of completedItemIds) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  if (completedItemId && !counts.has(completedItemId)) counts.set(completedItemId, 1);
  return counts;
}

function ActionCard({
  item,
  itemVariant,
  isFirst,
  isExiting,
  runningActionKey,
  actionError,
  onRunAction,
}: {
  item: ActionInboxItem;
  itemVariant: ActionInboxItemVariant;
  isFirst: boolean;
  isExiting: boolean;
  runningActionKey: string | null;
  actionError: { key: string; message: string } | null;
  onRunAction: (action: ActionInboxAction, triggerElement?: HTMLElement) => void;
}) {
  const presentation = CATEGORY_PRESENTATION[item.category];
  const isList = itemVariant === "list";
  const shouldShowRetryGuidance = item.category === "notification" || item.category === "management";
  const visibleActionIndex = Math.max(
    0,
    item.actions.findIndex((action) => action.emphasis === "primary"),
  );
  const visibleAction = item.actions[visibleActionIndex];
  const overflowActions = item.actions.filter((_, index) => index !== visibleActionIndex);
  const overflowActionError = overflowActions
    .map((action) => actionError?.key === `${item.id}:${action.label}`)
    .some(Boolean)
    ? actionError?.message
    : undefined;

  return (
    <Box
      as="article"
      data-state={isExiting ? "exiting" : "active"}
      position="relative"
      overflow="hidden"
      bg={isList ? "transparent" : "white"}
      borderWidth={isList ? 0 : "1px"}
      borderTopWidth={isList && !isFirst ? "1px" : 0}
      borderColor={isList ? "blackAlpha.100" : "gray.200"}
      borderRadius={isList ? 0 : "xl"}
      boxShadow={isList ? "none" : "sm"}
      transform={isExiting ? "translateX(105%)" : "translateX(0)"}
      opacity={isExiting ? 0 : 1}
      transition={`transform ${EXIT_DURATION_MS}ms ease-in, opacity ${EXIT_DURATION_MS}ms ease-in`}
      _motionReduce={{ transition: "none" }}
    >
      <Box
        display="grid"
        gridTemplateColumns={{ base: "40px minmax(0, 1fr)", md: "48px minmax(0, 1fr) auto" }}
        columnGap={{ base: 3, md: 4 }}
        rowGap={1.5}
        alignItems="center"
        py={{ base: 3, md: 4 }}
        px={{ base: 3, md: 5 }}
      >
        <Flex
          gridColumn="1"
          gridRow={{ base: "1 / span 4", md: "1 / span 3" }}
          align="center"
          justify="center"
          alignSelf="stretch"
          color="fg.muted"
        >
          <Icon as={presentation.icon} boxSize={{ base: 5, md: 6 }} aria-hidden />
        </Flex>

        <HStack gridColumn="2" gridRow="1" gap={2} minW={0} wrap="wrap">
          <Badge
            colorPalette={presentation.colorPalette}
            variant="subtle"
            bg={item.category === "staff" ? "teal.100" : undefined}
            borderRadius="full"
            px={2}
            py={0.5}
          >
            {item.statusLabel}
          </Badge>
        </HStack>

        <Stack gridColumn="2" gridRow="2" gap={1} minW={0}>
          <Text
            as="h2"
            minW={0}
            fontSize={{ base: "md", md: "lg" }}
            fontWeight="bold"
            color="gray.900"
            lineHeight="short"
          >
            {item.title}
          </Text>
          {shouldShowRetryGuidance && <RetryGuidance />}
        </Stack>

        <Metadata gridColumn="2" gridRow="3" values={item.metadata} />

        <Stack
          gridColumn={{ base: "2", md: "3" }}
          gridRow={{ base: "4", md: "1 / span 3" }}
          alignSelf={{ base: "stretch", md: "center" }}
          gap={1}
          minW={0}
          w="full"
        >
          <Flex gap={{ base: 2, md: 4 }} align="center" justify="space-between" w="full" minW={0}>
            <Flex gap={2} justify="flex-end" align="flex-start" ms="auto" flexShrink={0}>
              <ActionButton
                action={visibleAction}
                category={item.category}
                isRunning={runningActionKey === `${item.id}:${visibleAction.label}`}
                isInteractionDisabled={isExiting || runningActionKey !== null}
                errorMessage={
                  actionError?.key === `${item.id}:${visibleAction.label}` ? actionError.message : undefined
                }
                onRun={(triggerElement) => onRunAction(visibleAction, triggerElement)}
              />
              {overflowActions.length > 0 && (
                <ActionMenu
                  itemTitle={item.title}
                  actions={overflowActions}
                  isExiting={isExiting}
                  isInteractionDisabled={isExiting || runningActionKey !== null}
                  onRunAction={onRunAction}
                />
              )}
            </Flex>
          </Flex>
          {overflowActionError && (
            <Text w="full" fontSize="xs" color="red.700" lineHeight="tall" textAlign="right">
              {overflowActionError}
            </Text>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

function RetryGuidance() {
  return (
    <Text flex="1" minW={0} fontSize="xs" color="fg.muted" lineHeight="short">
      ※何度も失敗する場合は
      <Link
        href="/help/tasks/notifications"
        target="_blank"
        rel="noopener noreferrer"
        color="teal.700"
        textDecoration="underline"
      >
        こちら
      </Link>
      を確認ください
    </Text>
  );
}

function Metadata({
  values,
  gridColumn,
  gridRow,
}: {
  values: readonly ActionInboxMetadataItem[];
  gridColumn?: string;
  gridRow?: string;
}) {
  if (values.length === 0) return null;

  return (
    <Flex
      as="ul"
      aria-label="詳細"
      gridColumn={gridColumn}
      gridRow={gridRow}
      gapX={{ base: 3, md: 4 }}
      gapY={1}
      wrap="wrap"
      color="fg.muted"
      fontSize="xs"
    >
      {values.map((value, index) => (
        <HStack as="li" key={`${value.label}-${index}`} gap={1.5} listStyleType="none">
          <MetadataIcon icon={value.icon} />
          <Text as="span">{value.label}</Text>
        </HStack>
      ))}
    </Flex>
  );
}

function MetadataIcon({ icon }: { icon: ActionInboxMetadataItem["icon"] }) {
  const iconByKind = {
    shop: LuStore,
    calendar: LuCalendarDays,
    people: LuUsers,
    mail: LuMail,
    clock: LuClock3,
  } as const;
  const metadataIcon = icon ? iconByKind[icon] : undefined;
  return metadataIcon ? <Icon as={metadataIcon} boxSize={4} flexShrink={0} aria-hidden /> : null;
}

function ActionButton({
  action,
  category,
  isRunning,
  isInteractionDisabled,
  errorMessage,
  onRun,
}: {
  action: ActionInboxAction;
  category: ActionInboxItemCategory;
  isRunning: boolean;
  isInteractionDisabled: boolean;
  errorMessage?: string;
  onRun: (triggerElement: HTMLElement) => void;
}) {
  const style = getActionButtonStyle(action.emphasis ?? "secondary", category);

  return (
    <Stack gap={1} minW={{ base: "auto", md: "144px" }} flex="0 0 auto">
      <Button
        type="button"
        variant={style.variant}
        colorPalette={style.colorPalette}
        w={{ base: "auto", md: "full" }}
        whiteSpace="nowrap"
        minH="44px"
        px={4}
        disabled={action.disabled || (isInteractionDisabled && !isRunning)}
        loading={isRunning}
        loadingText={action.label}
        onClick={action.disabled ? undefined : (event) => onRun(event.currentTarget)}
      >
        {action.label}
      </Button>
      {action.disabled && (
        <Text fontSize="xs" color="fg.muted" lineHeight="tall">
          {action.disabledReason}
        </Text>
      )}
      {errorMessage && (
        <Text fontSize="xs" color="red.700" lineHeight="tall">
          {errorMessage}
        </Text>
      )}
    </Stack>
  );
}

function ActionMenu({
  itemTitle,
  actions,
  isExiting,
  isInteractionDisabled,
  onRunAction,
}: {
  itemTitle: string;
  actions: readonly ActionInboxAction[];
  isExiting: boolean;
  isInteractionDisabled: boolean;
  onRunAction: (action: ActionInboxAction, triggerElement?: HTMLElement) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton
          ref={triggerRef}
          aria-label={`${itemTitle}のその他の操作`}
          variant="outline"
          minW="44px"
          minH="44px"
          color="fg.muted"
          disabled={isInteractionDisabled && !isExiting}
          aria-disabled={isInteractionDisabled || undefined}
          pointerEvents={isExiting ? "none" : undefined}
          tabIndex={isExiting ? -1 : undefined}
          onClickCapture={isExiting ? preventInteraction : undefined}
          onKeyDownCapture={isExiting ? preventInteraction : undefined}
        >
          <LuEllipsis size={20} aria-hidden />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="220px">
            {actions.map((action) => {
              const isDisabled = action.disabled || isInteractionDisabled;
              return (
                <Menu.Item
                  key={action.label}
                  value={action.label}
                  color={action.emphasis === "danger" ? "red.600" : undefined}
                  cursor={isDisabled ? "not-allowed" : "pointer"}
                  disabled={isDisabled}
                  onSelect={
                    isDisabled
                      ? undefined
                      : () => {
                          const triggerElement = triggerRef.current;
                          triggerElement?.focus();
                          onRunAction(action, triggerElement ?? undefined);
                        }
                  }
                >
                  <Stack gap={0.5} minW={0}>
                    <Box>{action.label}</Box>
                    {action.disabled && (
                      <Box fontSize="xs" color="fg.muted" lineHeight="short" whiteSpace="normal">
                        {action.disabledReason}
                      </Box>
                    )}
                  </Stack>
                </Menu.Item>
              );
            })}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

function getActionButtonStyle(
  emphasis: NonNullable<ActionInboxAction["emphasis"]>,
  category: ActionInboxItemCategory,
): {
  variant: ButtonProps["variant"];
  colorPalette: ButtonProps["colorPalette"];
} {
  if (emphasis === "primary") return { variant: "outline", colorPalette: category === "shift" ? "orange" : "teal" };
  if (emphasis === "danger") return { variant: "outline", colorPalette: "red" };
  return { variant: "outline", colorPalette: "gray" };
}
