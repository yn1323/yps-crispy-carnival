import { Accordion, Badge, Box, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuCalendarClock,
  LuCalendarDays,
  LuCircleAlert,
  LuPlus,
  LuSparkles,
  LuTriangleAlert,
  LuUserCheck,
  LuUsers,
} from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";
import type { NextAction } from "./pickNextAction";

type Props = {
  action?: NextAction;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onCreateRecruitment: () => void;
  isCreateRecruitmentActionDisabled?: boolean;
  createRecruitmentDisabledReason?: string;
  notificationTask: DisclosureTask | null;
  staffRegistrationRequest?: {
    count: number;
    content: ReactNode;
  };
};

type DisclosureTask = {
  count: number;
  content: ReactNode;
};

export const ActionTaskList = ({
  action,
  onOpenShiftBoard,
  onCreateRecruitment,
  isCreateRecruitmentActionDisabled = false,
  createRecruitmentDisabledReason,
  notificationTask,
  staffRegistrationRequest,
}: Props) => {
  const shiftTask = action
    ? createShiftActionTask(
        action,
        onOpenShiftBoard,
        onCreateRecruitment,
        isCreateRecruitmentActionDisabled,
        createRecruitmentDisabledReason,
      )
    : null;
  const disclosureTasks = [
    notificationTask ? createNotificationFailureTask(notificationTask.count, notificationTask.content) : null,
    staffRegistrationRequest
      ? createStaffRegistrationRequestTask(staffRegistrationRequest.count, staffRegistrationRequest.content)
      : null,
  ].filter((task): task is ActionDisclosureTask => task !== null);

  if (!shiftTask && disclosureTasks.length === 0) return null;

  return (
    <Stack gap={{ base: 3, md: 4 }}>
      {shiftTask && (
        <ActionTaskCard>
          <ActionTaskRow task={shiftTask} />
        </ActionTaskCard>
      )}
      {disclosureTasks.map((task) => (
        <ActionDisclosureCard key={task.key} task={task} />
      ))}
    </Stack>
  );
};

const createShiftActionTask = (
  action: NextAction,
  onOpenShiftBoard: (recruitmentId: string) => void,
  onCreateRecruitment: () => void,
  isCreateRecruitmentActionDisabled: boolean,
  createRecruitmentDisabledReason?: string,
): ActionTask => {
  if (action.kind === "idle") {
    return {
      key: "shift-action",
      icon: LuSparkles,
      iconBg: "teal.100",
      iconFg: "teal.700",
      title: "次の募集をつくりましょう",
      metaItems: [{ label: "募集中のシフトなし" }],
      cta: {
        label: "募集をつくる",
        icon: LuPlus,
        palette: "teal",
        variant: "solid",
        onClick: onCreateRecruitment,
        isDisabled: isCreateRecruitmentActionDisabled,
        disabledReason: createRecruitmentDisabledReason,
      },
    };
  }

  const view = describeAction(action);
  return {
    key: "shift-action",
    icon: view.icon,
    iconBg: view.iconBg,
    iconFg: view.iconFg,
    title: view.title,
    titleColor: view.titleColor,
    rowBg: view.rowBg,
    metaItems: view.metaItems,
    cta: {
      ...view.cta,
      onClick: () => onOpenShiftBoard(action.recruitment._id),
    },
  };
};

const createNotificationFailureTask = (count: number, content: ReactNode): ActionDisclosureTask => ({
  key: "notification-failure",
  icon: LuTriangleAlert,
  iconBg: "orange.100",
  iconFg: "orange.600",
  title: `送れなかった通知が${count}件あります`,
  titleColor: "orange.800",
  content,
});

const createStaffRegistrationRequestTask = (count: number, content: ReactNode): ActionDisclosureTask => ({
  key: "staff-registration-request",
  icon: LuUserCheck,
  iconBg: "teal.50",
  iconFg: "teal.700",
  title: `スタッフ登録申請が${count}件あります`,
  description: "承認してシフトが届く状態にしましょう",
  content,
});

type ActionDisclosureTask = {
  key: "notification-failure" | "staff-registration-request";
  icon: IconType;
  iconBg: string;
  iconFg: string;
  title: string;
  titleColor?: string;
  description?: string;
  content: ReactNode;
};

type ActionTask = {
  key: string;
  icon: IconType;
  iconBg: string;
  iconFg: string;
  title: string;
  titleColor?: string;
  description?: string;
  rowBg?: string;
  metaItems?: MetaItem[];
  cta: {
    label: string;
    icon?: IconType;
    palette: "teal" | "orange";
    variant: "solid" | "outline";
    onClick: () => void;
    isDisabled?: boolean;
    disabledReason?: string;
  };
};

type MetaItem = {
  icon?: IconType;
  label: string;
  emphasis?: boolean;
};

const ActionTaskCard = ({ children }: { children: ReactNode }) => (
  <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.50" boxShadow="xs" overflow="hidden">
    {children}
  </Box>
);

const ActionTaskRow = ({ task }: { task: ActionTask }) => {
  const Icon = task.icon;
  const CtaIcon = task.cta.icon;

  return (
    <Flex
      bg={task.rowBg ?? "white"}
      px={{ base: 4, md: 6, lg: 7 }}
      py={{ base: 4, md: 5 }}
      gap={{ base: 4, md: 5 }}
      align={{ base: "stretch", md: "center" }}
      direction={{ base: "column", md: "row" }}
    >
      <HStack gap={{ base: 3, md: 4 }} align={{ base: "flex-start", md: "center" }} flex={1} minW={0}>
        <Flex
          boxSize={{ base: "48px", md: "56px" }}
          borderRadius="full"
          bg={task.iconBg}
          color={task.iconFg}
          align="center"
          justify="center"
          flexShrink={0}
          borderWidth={task.key === "staff-registration-request" ? "1px" : 0}
          borderColor={task.key === "staff-registration-request" ? "border.default" : undefined}
        >
          <Icon size={28} />
        </Flex>
        <Stack gap={1.5} minW={0} flex={1}>
          <Text
            fontSize={{ base: "md", md: "lg" }}
            fontWeight="bold"
            color={task.titleColor ?? "gray.900"}
            lineHeight="short"
            whiteSpace="pre-line"
          >
            {task.title}
          </Text>
          {task.description && (
            <Text fontSize={{ base: "sm", md: "sm" }} color="gray.700" lineHeight="tall" whiteSpace="pre-line">
              {task.description}
            </Text>
          )}
          {task.metaItems && task.metaItems.length > 0 && (
            <HStack gap={2} wrap="wrap" pt={0.5}>
              {task.metaItems.map((item) => (
                <MetaChip key={item.label} item={item} />
              ))}
            </HStack>
          )}
        </Stack>
      </HStack>
      <Button
        colorPalette={task.cta.palette}
        variant={task.cta.variant}
        size="md"
        gap={1.5}
        fontWeight="semibold"
        alignSelf={{ base: "stretch", md: "center" }}
        justifyContent="center"
        minW={{ md: "136px" }}
        flexShrink={0}
        disabled={task.cta.isDisabled}
        title={task.cta.isDisabled ? task.cta.disabledReason : undefined}
        onClick={task.cta.onClick}
      >
        {CtaIcon && <CtaIcon />}
        {task.cta.label}
        {!CtaIcon && <LuArrowRight />}
      </Button>
    </Flex>
  );
};

const ActionDisclosureCard = ({ task }: { task: ActionDisclosureTask }) => {
  const Icon = task.icon;

  return (
    <Accordion.Root collapsible variant="plain">
      <Accordion.Item
        value={task.key}
        bg="white"
        borderRadius="xl"
        borderWidth="1px"
        borderColor="blackAlpha.50"
        boxShadow="xs"
        overflow="hidden"
      >
        <Accordion.ItemTrigger
          px={{ base: 4, md: 6, lg: 7 }}
          py={{ base: 4, md: 5 }}
          gap={{ base: 3, md: 4 }}
          minH="72px"
          cursor="pointer"
          textAlign="left"
          bg="white"
          _hover={{ bg: "gray.50" }}
          _expanded={{ bg: "white" }}
        >
          <Flex
            boxSize={{ base: "48px", md: "56px" }}
            borderRadius="full"
            bg={task.iconBg}
            color={task.iconFg}
            align="center"
            justify="center"
            flexShrink={0}
            borderWidth={task.key === "staff-registration-request" ? "1px" : 0}
            borderColor={task.key === "staff-registration-request" ? "border.default" : undefined}
          >
            <Icon size={28} />
          </Flex>
          <Stack gap={1.5} minW={0} flex={1}>
            <Text
              fontSize={{ base: "md", md: "lg" }}
              fontWeight="bold"
              color={task.titleColor ?? "gray.900"}
              lineHeight="short"
            >
              {task.title}
            </Text>
            {task.description && (
              <Text fontSize="sm" color="gray.700" lineHeight="tall">
                {task.description}
              </Text>
            )}
          </Stack>
          <Accordion.ItemIndicator color="fg.muted" flexShrink={0} />
        </Accordion.ItemTrigger>
        <Accordion.ItemContent bg="white">
          <Accordion.ItemBody px={{ base: 3, md: 5, lg: 6 }} pt={3} pb={{ base: 4, md: 5 }}>
            {task.content}
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
};

const MetaChip = ({ item }: { item: MetaItem }) => {
  const MetaIcon = item.icon;

  return (
    <Badge
      variant="subtle"
      colorPalette={item.emphasis ? "orange" : "gray"}
      borderRadius="full"
      px={2.5}
      py={1}
      fontSize="xs"
      fontWeight="medium"
    >
      <HStack as="span" gap={1.5}>
        {MetaIcon && <MetaIcon size={14} />}
        <Box as="span">{item.label}</Box>
      </HStack>
    </Badge>
  );
};

type ActionView = {
  icon: IconType;
  iconBg: string;
  iconFg: string;
  title: string;
  titleColor?: string;
  rowBg?: string;
  metaItems: MetaItem[];
  cta: { label: string; palette: "teal" | "orange"; variant: "solid" | "outline" };
};

function describeAction(action: Exclude<NextAction, { kind: "idle" }>): ActionView {
  switch (action.kind) {
    case "past-deadline": {
      const { periodStart, periodEnd, deadline, responseCount, totalStaffCount } = action.recruitment;
      return {
        icon: LuCircleAlert,
        iconBg: "orange.100",
        iconFg: "orange.600",
        title: "シフトを組んでスタッフに共有しましょう",
        rowBg: "orange.50/30",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount, totalStaffCount),
          { icon: LuCalendarClock, label: `提出期限 ${formatDateShort(deadline)}`, emphasis: true },
        ],
        cta: { label: "シフトを組む", palette: "orange", variant: "solid" },
      };
    }
    case "deadline-today": {
      const { periodStart, periodEnd, responseCount, totalStaffCount } = action.recruitment;
      return {
        icon: LuCircleAlert,
        iconBg: "orange.100",
        iconFg: "orange.600",
        title: "本日が提出期限です",
        rowBg: "orange.50/30",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount, totalStaffCount),
          { icon: LuCalendarClock, label: "今日が提出期限", emphasis: true },
        ],
        cta: { label: "回収状況を見る", palette: "orange", variant: "solid" },
      };
    }
    case "deadline-soon": {
      const { periodStart, periodEnd, responseCount, totalStaffCount } = action.recruitment;
      return {
        icon: LuCalendarClock,
        iconBg: "teal.100",
        iconFg: "teal.700",
        title: "シフト回収中です。\nしばらくお待ちください。",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount, totalStaffCount),
          { icon: LuCalendarClock, label: `提出期限まで${action.daysLeft}日`, emphasis: true },
        ],
        cta: { label: "回収状況を見る", palette: "teal", variant: "outline" },
      };
    }
    case "collecting": {
      const { periodStart, periodEnd, responseCount, totalStaffCount } = action.recruitment;
      return {
        icon: LuCalendarClock,
        iconBg: "teal.50",
        iconFg: "teal.700",
        title: "シフト回収中です。\nしばらくお待ちください。",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount, totalStaffCount),
          { icon: LuCalendarClock, label: `提出期限まで${action.daysLeft}日` },
        ],
        cta: { label: "回収状況を見る", palette: "teal", variant: "outline" },
      };
    }
  }
}

function createPeriodMeta(periodStart: string, periodEnd: string): MetaItem {
  return { icon: LuCalendarDays, label: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)}` };
}

function createResponseMeta(responseCount: number, totalStaffCount: number): MetaItem {
  return { icon: LuUsers, label: `提出${responseCount}/${totalStaffCount}人` };
}
