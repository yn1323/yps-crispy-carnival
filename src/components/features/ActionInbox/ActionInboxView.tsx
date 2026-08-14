import { Badge, Box, Flex, HStack, Icon, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { LuBellOff, LuCalendarClock, LuCircleCheck, LuShieldAlert, LuStore, LuUserRoundPlus } from "react-icons/lu";
import { Button, type ButtonProps } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import type {
  ActionInboxAction,
  ActionInboxCategory,
  ActionInboxItem,
  ActionInboxItemCategory,
  ActionInboxMetadataItem,
} from "./types";

type Props = {
  items: readonly ActionInboxItem[];
  /** @deprecated 少量の対応項目を一つの一覧で扱うため、種類フィルターは表示しません。 */
  activeCategory?: ActionInboxCategory;
  /** @deprecated 少量の対応項目を一つの一覧で扱うため、種類フィルターは表示しません。 */
  onCategoryChange?: (category: ActionInboxCategory) => void;
};

type CategoryPresentation = {
  label: string;
  icon: IconType;
  accent: string;
  iconBg: string;
  iconColor: string;
  colorPalette: "orange" | "teal" | "red" | "purple";
};

const CATEGORY_PRESENTATION: Record<ActionInboxItemCategory, CategoryPresentation> = {
  shift: {
    label: "シフト",
    icon: LuCalendarClock,
    accent: "orange.500",
    iconBg: "orange.50",
    iconColor: "orange.600",
    colorPalette: "orange",
  },
  staff: {
    label: "スタッフ",
    icon: LuUserRoundPlus,
    accent: "teal.600",
    iconBg: "teal.100",
    iconColor: "teal.700",
    colorPalette: "teal",
  },
  notification: {
    label: "通知",
    icon: LuBellOff,
    accent: "red.500",
    iconBg: "red.50",
    iconColor: "red.600",
    colorPalette: "red",
  },
  management: {
    label: "管理",
    icon: LuShieldAlert,
    accent: "purple.500",
    iconBg: "purple.50",
    iconColor: "purple.600",
    colorPalette: "purple",
  },
};

const EXIT_DURATION_MS = 240;

export function ActionInboxView({ items }: Props) {
  const [exitingItemIds, setExitingItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [dismissedItemIds, setDismissedItemIds] = useState<ReadonlySet<string>>(() => new Set());
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ key: string; message: string } | null>(null);
  const [completionAnnouncement, setCompletionAnnouncement] = useState("");
  const exitTimersRef = useRef<Set<number>>(new Set());
  const runningActionKeyRef = useRef<string | null>(null);
  const visibleItems = items.filter((item) => !dismissedItemIds.has(item.id));

  useEffect(
    () => () => {
      for (const timerId of exitTimersRef.current) window.clearTimeout(timerId);
      exitTimersRef.current.clear();
    },
    [],
  );

  const runAction = async (item: ActionInboxItem, action: ActionInboxAction) => {
    if (action.disabled) return;

    const actionKey = `${item.id}:${action.label}`;
    if (runningActionKeyRef.current !== null) return;

    runningActionKeyRef.current = actionKey;
    setRunningActionKey(actionKey);
    setActionError(null);
    try {
      await action.onClick();
      if (!action.removesItemOnSuccess) return;

      setExitingItemIds((current) => new Set(current).add(item.id));
      setCompletionAnnouncement(action.successMessage);

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timerId = window.setTimeout(
        () => {
          setDismissedItemIds((current) => new Set(current).add(item.id));
          setExitingItemIds((current) => {
            const next = new Set(current);
            next.delete(item.id);
            return next;
          });
          exitTimersRef.current.delete(timerId);
        },
        prefersReducedMotion ? 0 : EXIT_DURATION_MS,
      );
      exitTimersRef.current.add(timerId);
    } catch {
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
        <Empty
          icon={LuCircleCheck}
          title="対応が必要な項目はありません"
          description="現在、確認や操作が必要な項目はありません。"
          tone="success"
          variant="section"
          minH="240px"
        />
      ) : (
        <Stack as="section" aria-label="対応が必要な項目" gap={0}>
          {visibleItems.map((item) => (
            <Box
              key={item.id}
              display="grid"
              gridTemplateRows={exitingItemIds.has(item.id) ? "0fr" : "1fr"}
              pb={exitingItemIds.has(item.id) ? 0 : { base: 3, md: 4 }}
              transition={`grid-template-rows ${EXIT_DURATION_MS}ms ease, padding-bottom ${EXIT_DURATION_MS}ms ease`}
              _motionReduce={{ transition: "none" }}
            >
              <Box minH={0} overflow="hidden">
                <ActionCard
                  item={item}
                  isExiting={exitingItemIds.has(item.id)}
                  runningActionKey={runningActionKey}
                  actionError={actionError}
                  onRunAction={(action) => void runAction(item, action)}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ActionCard({
  item,
  isExiting,
  runningActionKey,
  actionError,
  onRunAction,
}: {
  item: ActionInboxItem;
  isExiting: boolean;
  runningActionKey: string | null;
  actionError: { key: string; message: string } | null;
  onRunAction: (action: ActionInboxAction) => void;
}) {
  const presentation = CATEGORY_PRESENTATION[item.category];

  return (
    <Box
      as="article"
      position="relative"
      overflow="hidden"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="xl"
      boxShadow="sm"
      transform={isExiting ? "translateX(105%)" : "translateX(0)"}
      opacity={isExiting ? 0 : 1}
      transition={`transform ${EXIT_DURATION_MS}ms ease-in, opacity ${EXIT_DURATION_MS}ms ease-in`}
      _motionReduce={{ transition: "none" }}
    >
      <Box position="absolute" insetY={0} insetStart={0} w="5px" bg={presentation.accent} aria-hidden />

      <Flex
        gap={{ base: 3, md: 4 }}
        align={{ base: "flex-start", md: "center" }}
        direction={{ base: "column", md: "row" }}
        py={{ base: 4, md: 4 }}
        ps={{ base: 5, md: 6 }}
        pe={{ base: 4, md: 5 }}
      >
        <Flex gap={3} align="flex-start" minW={0} flex={1}>
          <Flex
            boxSize="40px"
            flexShrink={0}
            align="center"
            justify="center"
            borderRadius="full"
            bg={presentation.iconBg}
            color={presentation.iconColor}
          >
            <Icon as={presentation.icon} boxSize={5} aria-hidden />
          </Flex>

          <Stack gap={1.5} minW={0} flex={1}>
            <HStack gap={2} wrap="wrap">
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
                {presentation.label}
              </Text>
              <Badge colorPalette={presentation.colorPalette} variant="subtle" borderRadius="full" px={2} py={0.5}>
                {item.statusLabel}
              </Badge>
            </HStack>

            <Text as="h2" fontSize="md" fontWeight="bold" color="gray.900" lineHeight="short">
              {item.title}
            </Text>

            <Metadata values={item.metadata} />
          </Stack>
        </Flex>

        <Flex
          gap={2}
          wrap={{ base: "wrap", sm: "nowrap" }}
          justify="flex-end"
          align="flex-start"
          w={{ base: "full", md: "auto" }}
          ps={{ base: "52px", md: 0 }}
        >
          {item.actions.map((action) => (
            <ActionButton
              key={action.label}
              action={action}
              isRunning={runningActionKey === `${item.id}:${action.label}`}
              isInteractionDisabled={isExiting || runningActionKey !== null}
              errorMessage={actionError?.key === `${item.id}:${action.label}` ? actionError.message : undefined}
              onRun={() => onRunAction(action)}
            />
          ))}
        </Flex>
      </Flex>
    </Box>
  );
}

function Metadata({ values }: { values: readonly ActionInboxMetadataItem[] }) {
  if (values.length === 0) return null;

  return (
    <Flex as="ul" aria-label="詳細" gapX={2} gapY={1} wrap="wrap" color="fg.muted" fontSize="sm">
      {values.map((value, index) => (
        <HStack as="li" key={`${value.label}-${index}`} gap={2} listStyleType="none">
          {index > 0 && (
            <Text as="span" aria-hidden>
              ・
            </Text>
          )}
          <HStack as="span" gap={1}>
            {value.icon === "shop" && <Icon as={LuStore} boxSize={4} aria-hidden />}
            <Text as="span">{value.label}</Text>
          </HStack>
        </HStack>
      ))}
    </Flex>
  );
}

function ActionButton({
  action,
  isRunning,
  isInteractionDisabled,
  errorMessage,
  onRun,
}: {
  action: ActionInboxAction;
  isRunning: boolean;
  isInteractionDisabled: boolean;
  errorMessage?: string;
  onRun: () => void;
}) {
  const style = getActionButtonStyle(action.emphasis ?? "secondary");

  return (
    <Stack gap={1} minW={{ base: "128px", md: "144px" }} flex={{ base: "1 1 128px", md: "0 0 auto" }}>
      <Button
        type="button"
        variant={style.variant}
        colorPalette={style.colorPalette}
        minH="44px"
        px={4}
        disabled={action.disabled || (isInteractionDisabled && !isRunning)}
        loading={isRunning}
        loadingText={action.label}
        onClick={action.disabled ? undefined : onRun}
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

function getActionButtonStyle(emphasis: NonNullable<ActionInboxAction["emphasis"]>): {
  variant: ButtonProps["variant"];
  colorPalette: ButtonProps["colorPalette"];
} {
  if (emphasis === "primary") return { variant: "solid", colorPalette: "teal" };
  if (emphasis === "danger") return { variant: "outline", colorPalette: "red" };
  return { variant: "outline", colorPalette: "gray" };
}
