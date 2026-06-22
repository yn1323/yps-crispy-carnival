import { Badge, Box, Flex, Heading, HStack, Image, Skeleton, Stack, Text } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuCalendarClock,
  LuCalendarDays,
  LuCircleAlert,
  LuCircleCheck,
  LuPlus,
  LuSparkles,
  LuTriangleAlert,
  LuUserCheck,
  LuUsers,
} from "react-icons/lu";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";
import { type NextAction, pickNextAction } from "./pickNextAction";
import registerStartImage from "./register-start.webp";

type Shop = {
  name: string;
};

type Props = {
  shop: Shop;
  recruitments: Recruitment[];
  onEditClick: () => void;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onCreateRecruitment: () => void;
  announcementBanner?: ReactNode;
  staffRegistrationRequest?: {
    count: number;
    onClick: () => void;
  };
  hasNotificationFailures?: boolean;
  onNotificationFailuresClick?: () => void;
  hideActionSection?: boolean;
};

export const HeroSummary = ({
  shop,
  recruitments,
  onEditClick,
  onOpenShiftBoard,
  onCreateRecruitment,
  announcementBanner,
  staffRegistrationRequest,
  hasNotificationFailures = false,
  onNotificationFailuresClick,
  hideActionSection = false,
}: Props) => {
  const action = pickNextAction(recruitments);

  return (
    <Stack gap={{ base: 5, lg: 6 }}>
      <Stack gap={3} pb={{ base: 4, lg: 6 }} borderBottomWidth="1px" borderColor="gray.200">
        <Text display={{ base: "none", md: "block" }} fontSize="sm" fontWeight="semibold" color="fg.muted">
          店舗
        </Text>

        <Flex align="center" justify="space-between" direction="row" gap={4} minW={0}>
          <HStack gap={4} align="center" flex={1} minW={0}>
            <Heading as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900" truncate minW={0}>
              {shop.name}
            </Heading>
          </HStack>

          <Button
            aria-label="店舗設定を編集"
            variant="ghost"
            size="sm"
            colorPalette="teal"
            px={{ base: 0, md: 2 }}
            minW="auto"
            fontWeight="semibold"
            flexShrink={0}
            onClick={onEditClick}
          >
            編集
          </Button>
        </Flex>
      </Stack>

      {announcementBanner}

      {!hideActionSection && (
        <Stack gap={{ base: 3, lg: 4 }}>
          <HStack gap={2.5} align="center">
            <Box fontSize={{ base: "xl", lg: "2xl" }} flexShrink={0}>
              <LuCircleCheck />
            </Box>
            <Heading as="h2" textStyle="sectionTitle" color="gray.900">
              今やること
            </Heading>
          </HStack>

          <ActionTaskList
            action={action}
            onOpenShiftBoard={onOpenShiftBoard}
            onCreateRecruitment={onCreateRecruitment}
            notificationTask={
              hasNotificationFailures && onNotificationFailuresClick ? { onClick: onNotificationFailuresClick } : null
            }
            staffRegistrationRequest={staffRegistrationRequest}
          />
        </Stack>
      )}
    </Stack>
  );
};

export const HeroSummarySkeleton = () => (
  <Stack gap={{ base: 5, lg: 6 }} aria-label="ダッシュボード概要を読み込み中">
    <Stack gap={3} pb={{ base: 4, lg: 6 }} borderBottomWidth="1px" borderColor="gray.200">
      <Skeleton display={{ base: "none", md: "block" }} h="18px" w="40px" />

      <Flex align="center" justify="space-between" direction="row" gap={4} minW={0}>
        <Skeleton h={{ base: "28px", md: "40px" }} w={{ base: "160px", md: "240px" }} maxW="60%" />
        <Skeleton h="32px" w="48px" flexShrink={0} />
      </Flex>
    </Stack>

    <Stack gap={{ base: 3, lg: 4 }}>
      <HStack gap={2.5} align="center">
        <Skeleton boxSize={{ base: "24px", lg: "28px" }} borderRadius="full" />
        <Skeleton h={{ base: "26px", lg: "30px" }} w="112px" />
      </HStack>

      <Stack
        gap={0}
        bg="white"
        borderRadius="xl"
        borderWidth="1px"
        borderColor="blackAlpha.50"
        boxShadow="xs"
        overflow="hidden"
      >
        <ActionTaskRowSkeleton />
      </Stack>
    </Stack>
  </Stack>
);

const ActionTaskRowSkeleton = () => (
  <Flex
    bg="white"
    px={{ base: 4, md: 6, lg: 7 }}
    py={{ base: 4, md: 5 }}
    gap={{ base: 4, md: 5 }}
    align={{ base: "stretch", md: "center" }}
    direction={{ base: "column", md: "row" }}
  >
    <HStack gap={{ base: 3, md: 4 }} align={{ base: "flex-start", md: "center" }} flex={1} minW={0}>
      <Skeleton boxSize={{ base: "48px", md: "56px" }} borderRadius="full" flexShrink={0} />
      <Stack gap={2} minW={0} flex={1}>
        <Skeleton h={{ base: "20px", md: "24px" }} w={{ base: "220px", md: "300px" }} maxW="100%" />
        <HStack gap={2} wrap="wrap">
          <Skeleton h="24px" w="112px" borderRadius="full" />
          <Skeleton h="24px" w="92px" borderRadius="full" />
          <Skeleton h="24px" w="128px" borderRadius="full" />
        </HStack>
      </Stack>
    </HStack>
    <Skeleton h={{ base: "40px", md: "40px" }} w={{ base: "100%", md: "136px" }} flexShrink={0} />
  </Flex>
);

type WelcomeHeroProps = {
  onSetupClick: () => void;
};

export const WelcomeHero = ({ onSetupClick }: WelcomeHeroProps) => (
  <Box
    bg="white"
    borderRadius="xl"
    borderWidth="1px"
    borderColor="teal.100"
    px={{ base: 5, lg: 7 }}
    py={{ base: 5, lg: 6 }}
  >
    <Flex direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }} gap={{ base: 4, md: 8 }}>
      <Stack gap={4} flex={1} minW={0} maxW={{ md: "520px" }}>
        <Stack gap={1.5}>
          <Heading as="h1" textStyle="sectionTitle" color="gray.900" letterSpacing="-0.01em">
            お店の情報を登録しましょう
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            お店の名前とシフト希望の集め方を決めるだけで始められます。
          </Text>
        </Stack>
        <WelcomeHeroImage display={{ base: "flex", md: "none" }} />
        <Flex justify={{ base: "flex-end", md: "flex-start" }}>
          <Button colorPalette="teal" size="md" onClick={onSetupClick} gap={1.5}>
            お店を登録する
            <LuArrowRight />
          </Button>
        </Flex>
      </Stack>
      <WelcomeHeroImage display={{ base: "none", md: "flex" }} flex={1} justify="flex-end" />
    </Flex>
  </Box>
);

const WelcomeHeroImage = (props: ComponentProps<typeof Flex>) => (
  <Flex align="center" justify="center" {...props}>
    <Image
      src={registerStartImage}
      alt="お店登録の開始画面イメージ"
      w="full"
      maxW={{ base: "196px", md: "294px", lg: "336px" }}
      h="auto"
      objectFit="contain"
      loading="lazy"
    />
  </Flex>
);

// ---------- ActionTaskList ----------

type ActionTaskListProps = {
  action: NextAction;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onCreateRecruitment: () => void;
  notificationTask: { onClick: () => void } | null;
  staffRegistrationRequest?: {
    count: number;
    onClick: () => void;
  };
};

const ActionTaskList = ({
  action,
  onOpenShiftBoard,
  onCreateRecruitment,
  notificationTask,
  staffRegistrationRequest,
}: ActionTaskListProps) => {
  const tasks = [
    createShiftActionTask(action, onOpenShiftBoard, onCreateRecruitment),
    notificationTask ? createNotificationFailureTask(notificationTask.onClick) : null,
    staffRegistrationRequest
      ? createStaffRegistrationRequestTask(staffRegistrationRequest.count, staffRegistrationRequest.onClick)
      : null,
  ].filter((task): task is ActionTask => task !== null);

  return (
    <Stack
      gap={0}
      bg="white"
      borderRadius="xl"
      borderWidth="1px"
      borderColor="blackAlpha.50"
      boxShadow="xs"
      overflow="hidden"
    >
      {tasks.map((task, index) => (
        <ActionTaskRow key={task.key} task={task} isFirst={index === 0} />
      ))}
    </Stack>
  );
};

const createShiftActionTask = (
  action: NextAction,
  onOpenShiftBoard: (recruitmentId: string) => void,
  onCreateRecruitment: () => void,
): ActionTask => {
  if (action.kind === "idle") {
    return {
      key: "shift-action",
      icon: LuSparkles,
      iconBg: "teal.100",
      iconFg: "teal.700",
      title: "次の募集をつくりましょう",
      metaItems: [{ label: "募集中のシフトなし" }],
      cta: { label: "募集をつくる", icon: LuPlus, palette: "teal", variant: "solid", onClick: onCreateRecruitment },
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
      onClick: () => onOpenShiftBoard(getRecruitmentId(action)),
    },
  };
};

const createNotificationFailureTask = (onClick: () => void): ActionTask => ({
  key: "notification-failure",
  icon: LuTriangleAlert,
  iconBg: "orange.100",
  iconFg: "orange.600",
  title: "不達通知があります",
  titleColor: "orange.800",
  description: "送信できなかった通知を確認して再通知できます",
  rowBg: "orange.50/30",
  cta: { label: "通知を確認", palette: "orange", variant: "outline", onClick },
});

const createStaffRegistrationRequestTask = (count: number, onClick: () => void): ActionTask => ({
  key: "staff-registration-request",
  icon: LuUserCheck,
  iconBg: "teal.50",
  iconFg: "teal.700",
  title: `スタッフ参加申請が${count}件あります`,
  description: "内容を確認して承認・却下できます",
  cta: { label: "申請を確認", palette: "teal", variant: "outline", onClick },
});

const getRecruitmentId = (action: Exclude<NextAction, { kind: "idle" }>) => action.recruitment._id;

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
  };
};

type MetaItem = {
  icon?: IconType;
  label: string;
  emphasis?: boolean;
};

const ActionTaskRow = ({ task, isFirst }: { task: ActionTask; isFirst: boolean }) => {
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
      borderTopWidth={isFirst ? 0 : "1px"}
      borderColor="gray.100"
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
          borderColor={task.key === "staff-registration-request" ? "teal.200" : undefined}
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
            <Text fontSize={{ base: "sm", md: "sm" }} color="gray.700" lineHeight="tall">
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
        onClick={task.cta.onClick}
      >
        {CtaIcon && <CtaIcon />}
        {task.cta.label}
        {!CtaIcon && <LuArrowRight />}
      </Button>
    </Flex>
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
          { icon: LuCalendarClock, label: `締切 ${formatDateShort(deadline)}`, emphasis: true },
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
        title: "本日締切日です",
        rowBg: "orange.50/30",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount, totalStaffCount),
          { icon: LuCalendarClock, label: "今日が締切", emphasis: true },
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
        title: "シフト回収中です。しばらくお待ちください。",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount, totalStaffCount),
          { icon: LuCalendarClock, label: `締切まで${action.daysLeft}日`, emphasis: true },
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
        title: "シフト回収中です。しばらくお待ちください。",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount, totalStaffCount),
          { icon: LuCalendarClock, label: `締切まで${action.daysLeft}日` },
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
