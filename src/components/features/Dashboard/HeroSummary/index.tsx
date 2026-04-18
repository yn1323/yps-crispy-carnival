import { Box, Button, Flex, HStack, IconButton, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuCalendarClock, LuCircleAlert, LuSettings, LuSparkles } from "react-icons/lu";
import { formatShiftTimeRange } from "@/src/components/features/Dashboard/DashboardContent/formatShiftTimeRange";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { formatDateShort } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { type NextAction, pickNextAction } from "./pickNextAction";

type Shop = {
  name: string;
  shiftStartTime: string;
  shiftEndTime: string;
};

type Props = {
  shop: Shop;
  recruitments: Recruitment[];
  onEditClick: () => void;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onCreateRecruitment: () => void;
};

export const HeroSummary = ({ shop, recruitments, onEditClick, onOpenShiftBoard, onCreateRecruitment }: Props) => {
  const action = pickNextAction(recruitments);

  return (
    <HeroShell padding={{ base: 5, lg: 7 }}>
      <Stack gap={{ base: 5, lg: 6 }} position="relative">
        <Flex justify="space-between" align="flex-start" gap={3}>
          <Stack gap={1.5} minW={0}>
            <EyebrowPill>ダッシュボード</EyebrowPill>
            <Text
              fontSize={{ base: "2xl", lg: "3xl" }}
              fontWeight="bold"
              lineHeight="short"
              letterSpacing="-0.01em"
              color="gray.900"
              truncate
            >
              {shop.name}
            </Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="short">
              シフト時間帯 {formatShiftTimeRange(shop.shiftStartTime, shop.shiftEndTime)}
            </Text>
          </Stack>
          <IconButton
            aria-label="店舗設定を編集"
            variant="ghost"
            size="sm"
            color="fg.muted"
            onClick={onEditClick}
            borderRadius="full"
          >
            <LuSettings />
          </IconButton>
        </Flex>

        <ActionPanel action={action} onOpenShiftBoard={onOpenShiftBoard} onCreateRecruitment={onCreateRecruitment} />
      </Stack>
    </HeroShell>
  );
};

type WelcomeHeroProps = {
  onSetupClick: () => void;
};

export const WelcomeHero = ({ onSetupClick }: WelcomeHeroProps) => (
  <HeroShell padding={{ base: 6, lg: 8 }}>
    <Stack gap={5} maxW="520px" position="relative">
      <EyebrowPill>はじめに</EyebrowPill>
      <Stack gap={2}>
        <Text fontSize={{ base: "2xl", lg: "3xl" }} fontWeight="bold" lineHeight="short" letterSpacing="-0.01em">
          まずは お店のことを
          <br />
          教えてください
        </Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          シフトの時間帯を登録すると ここがあなたのダッシュボードになります
        </Text>
      </Stack>
      <Flex>
        <Button colorPalette="teal" size="md" onClick={onSetupClick} gap={1.5}>
          店舗を登録する
          <LuArrowRight />
        </Button>
      </Flex>
    </Stack>
  </HeroShell>
);

const HeroShell = ({ padding, children }: { padding: { base: number; lg: number }; children: ReactNode }) => (
  <Box
    position="relative"
    overflow="hidden"
    borderRadius="2xl"
    bgGradient="to-br"
    gradientFrom="teal.50"
    gradientVia="white"
    gradientTo="white"
    borderWidth="1px"
    borderColor="teal.100"
    p={padding}
  >
    <Decoration />
    {children}
  </Box>
);

type ActionPanelProps = {
  action: NextAction;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onCreateRecruitment: () => void;
};

const ActionPanel = ({ action, onOpenShiftBoard, onCreateRecruitment }: ActionPanelProps) => {
  const view = describeAction(action);
  const onClick = action.kind === "idle" ? onCreateRecruitment : () => onOpenShiftBoard(action.recruitment._id);

  return (
    <Box
      borderRadius="xl"
      bg="white"
      borderWidth="1px"
      borderColor={view.borderColor}
      boxShadow="xs"
      px={{ base: 4, lg: 5 }}
      py={4}
    >
      <Flex
        gap={{ base: 3, lg: 4 }}
        align={{ base: "flex-start", lg: "center" }}
        direction={{ base: "column", sm: "row" }}
      >
        <HStack gap={3} flex={1} align="flex-start" minW={0}>
          <Flex
            boxSize="40px"
            borderRadius="full"
            bg={view.iconBg}
            color={view.iconColor}
            align="center"
            justify="center"
            flexShrink={0}
          >
            <view.icon size={20} />
          </Flex>
          <Stack gap={0.5} minW={0}>
            <Text fontSize="md" fontWeight="bold" color="gray.900" lineHeight="short">
              {view.title}
            </Text>
            <Text fontSize="xs" color="fg.muted" lineHeight="tall">
              {view.subtitle}
            </Text>
          </Stack>
        </HStack>
        <Button
          colorPalette={view.ctaPalette}
          variant={view.ctaVariant}
          size="sm"
          gap={1.5}
          onClick={onClick}
          fontWeight="semibold"
          alignSelf={{ base: "stretch", sm: "center" }}
          flexShrink={0}
        >
          {view.ctaLabel}
          <LuArrowRight />
        </Button>
      </Flex>
    </Box>
  );
};

type ActionView = {
  icon: IconType;
  iconBg: string;
  iconColor: string;
  borderColor: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaPalette: "teal" | "orange";
  ctaVariant: "solid" | "outline";
};

function describeAction(action: NextAction): ActionView {
  switch (action.kind) {
    case "past-deadline": {
      const { periodStart, periodEnd, deadline, responseCount } = action.recruitment;
      return {
        icon: LuCircleAlert,
        iconBg: "orange.100",
        iconColor: "orange.600",
        borderColor: "orange.200",
        title: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)} の シフト調整がまだ`,
        subtitle: `締切は ${formatDateShort(deadline)} 提出 ${responseCount}人`,
        ctaLabel: "シフトを見る",
        ctaPalette: "orange",
        ctaVariant: "solid",
      };
    }
    case "deadline-today": {
      const { periodStart, periodEnd, responseCount } = action.recruitment;
      return {
        icon: LuCalendarClock,
        iconBg: "orange.100",
        iconColor: "orange.600",
        borderColor: "orange.200",
        title: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)} は 今日が締切`,
        subtitle: `提出 ${responseCount}人`,
        ctaLabel: "シフトを見る",
        ctaPalette: "orange",
        ctaVariant: "solid",
      };
    }
    case "deadline-soon": {
      const { periodStart, periodEnd, responseCount } = action.recruitment;
      return {
        icon: LuCalendarClock,
        iconBg: "teal.100",
        iconColor: "teal.700",
        borderColor: "teal.200",
        title: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)} は あと${action.daysLeft}日で締切`,
        subtitle: `提出 ${responseCount}人`,
        ctaLabel: "シフトを見る",
        ctaPalette: "teal",
        ctaVariant: "outline",
      };
    }
    case "idle":
      return {
        icon: LuSparkles,
        iconBg: "teal.100",
        iconColor: "teal.700",
        borderColor: "teal.100",
        title: "今日 やることはありません",
        subtitle: "次の募集を作って シフト希望を集めよう",
        ctaLabel: "募集を作る",
        ctaPalette: "teal",
        ctaVariant: "solid",
      };
  }
}

const Decoration = () => (
  <>
    <Box
      aria-hidden
      position="absolute"
      top="-60px"
      right="-40px"
      boxSize="180px"
      borderRadius="full"
      bg="teal.100"
      opacity={0.45}
      filter="blur(40px)"
    />
    <Box
      aria-hidden
      position="absolute"
      bottom="-80px"
      left="30%"
      boxSize="220px"
      borderRadius="full"
      bg="teal.50"
      opacity={0.6}
      filter="blur(60px)"
    />
  </>
);

const EyebrowPill = ({ children }: { children: string }) => (
  <HStack
    alignSelf="flex-start"
    gap={1.5}
    fontSize="11px"
    fontWeight="semibold"
    color="teal.700"
    bg="teal.100"
    px={2.5}
    py={1}
    borderRadius="full"
    letterSpacing="0.08em"
    textTransform="uppercase"
  >
    <Box boxSize="5px" borderRadius="full" bg="teal.500" />
    {children}
  </HStack>
);
