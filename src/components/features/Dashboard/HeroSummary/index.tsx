import { Box, Button, Flex, Heading, HStack, IconButton, Stack, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuCalendarClock, LuCircleAlert, LuPlus, LuSettings, LuSparkles } from "react-icons/lu";
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
    <Stack gap={3}>
      <Flex justify="space-between" align="center" gap={3}>
        <HStack gap={2.5} align="baseline" minW={0}>
          <Heading as="h1" fontSize={{ base: "xl", lg: "2xl" }} color="gray.900" letterSpacing="-0.01em" truncate>
            {shop.name}
          </Heading>
          <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
            {formatShiftTimeRange(shop.shiftStartTime, shop.shiftEndTime)}
          </Text>
        </HStack>
        <IconButton
          aria-label="店舗設定を編集"
          variant="ghost"
          size="sm"
          color="fg.muted"
          borderRadius="full"
          onClick={onEditClick}
          _hover={{ bg: "blackAlpha.50" }}
        >
          <LuSettings />
        </IconButton>
      </Flex>

      <ActionCard action={action} onOpenShiftBoard={onOpenShiftBoard} onCreateRecruitment={onCreateRecruitment} />
    </Stack>
  );
};

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
    <Stack gap={4} maxW="520px">
      <Stack gap={1.5}>
        <Heading as="h1" fontSize={{ base: "xl", lg: "2xl" }} color="gray.900" letterSpacing="-0.01em">
          お店の情報を登録しましょう
        </Heading>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          店舗名と営業時間を入れるだけで始められます。
        </Text>
      </Stack>
      <Flex>
        <Button colorPalette="teal" size="md" onClick={onSetupClick} gap={1.5}>
          店舗を登録する
          <LuArrowRight />
        </Button>
      </Flex>
    </Stack>
  </Box>
);

// ---------- ActionCard ----------

type ActionCardProps = {
  action: NextAction;
  onOpenShiftBoard: (recruitmentId: string) => void;
  onCreateRecruitment: () => void;
};

const ActionCard = ({ action, onOpenShiftBoard, onCreateRecruitment }: ActionCardProps) => {
  if (action.kind === "idle") {
    return (
      <SlimCard
        icon={LuSparkles}
        iconBg="teal.100"
        iconFg="teal.700"
        border="teal.100"
        title="今はやることがありません"
        sub="次の期間の募集をつくりましょう"
        cta={{ label: "募集をつくる", icon: LuPlus, palette: "teal", variant: "solid" }}
        onClick={onCreateRecruitment}
      />
    );
  }
  const view = describeAction(action);
  return (
    <SlimCard
      icon={view.icon}
      iconBg={view.iconBg}
      iconFg={view.iconFg}
      border={view.border}
      title={view.title}
      sub={view.sub}
      cta={view.cta}
      onClick={() => onOpenShiftBoard(getRecruitmentId(action))}
    />
  );
};

const getRecruitmentId = (action: Exclude<NextAction, { kind: "idle" }>) => action.recruitment._id;

type SlimCardProps = {
  icon: IconType;
  iconBg: string;
  iconFg: string;
  border: string;
  title: string;
  sub: string;
  cta: { label: string; icon?: IconType; palette: "teal" | "orange"; variant: "solid" | "outline" };
  onClick: () => void;
};

const SlimCard = ({ icon: Icon, iconBg, iconFg, border, title, sub, cta, onClick }: SlimCardProps) => (
  <Flex
    bg="white"
    borderRadius="xl"
    borderWidth="1px"
    borderColor={border}
    px={{ base: 4, lg: 5 }}
    py={4}
    gap={3}
    align={{ base: "stretch", sm: "center" }}
    direction={{ base: "column", sm: "row" }}
  >
    <HStack gap={3} flex={1} minW={0}>
      <Flex
        boxSize="40px"
        borderRadius="full"
        bg={iconBg}
        color={iconFg}
        align="center"
        justify="center"
        flexShrink={0}
      >
        <Icon size={20} />
      </Flex>
      <Stack gap={0.5} minW={0}>
        <Text fontSize="md" fontWeight="bold" color="gray.900" lineHeight="short">
          {title}
        </Text>
        <Text fontSize="xs" color="fg.muted" lineHeight="tall">
          {sub}
        </Text>
      </Stack>
    </HStack>
    <Button
      colorPalette={cta.palette}
      variant={cta.variant}
      size="sm"
      gap={1.5}
      fontWeight="semibold"
      alignSelf={{ base: "stretch", sm: "center" }}
      flexShrink={0}
      onClick={onClick}
    >
      {cta.icon && <cta.icon />}
      {cta.label}
      {!cta.icon && <LuArrowRight />}
    </Button>
  </Flex>
);

type ActionView = {
  icon: IconType;
  iconBg: string;
  iconFg: string;
  border: string;
  title: string;
  sub: string;
  cta: { label: string; palette: "teal" | "orange"; variant: "solid" | "outline" };
};

function describeAction(action: Exclude<NextAction, { kind: "idle" }>): ActionView {
  switch (action.kind) {
    case "past-deadline": {
      const { periodStart, periodEnd, deadline, responseCount } = action.recruitment;
      return {
        icon: LuCircleAlert,
        iconBg: "orange.100",
        iconFg: "orange.600",
        border: "orange.200",
        title: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)}のシフトを組みましょう`,
        sub: `提出${responseCount}人・締切${formatDateShort(deadline)}超過`,
        cta: { label: "シフトを組む", palette: "orange", variant: "solid" },
      };
    }
    case "deadline-today": {
      const { periodStart, periodEnd, responseCount } = action.recruitment;
      return {
        icon: LuCircleAlert,
        iconBg: "orange.100",
        iconFg: "orange.600",
        border: "orange.200",
        title: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)}は今日が締切`,
        sub: `提出${responseCount}人・今日の締切後にシフトを組めます`,
        cta: { label: "シフトを組む", palette: "orange", variant: "solid" },
      };
    }
    case "deadline-soon": {
      const { periodStart, periodEnd, responseCount } = action.recruitment;
      return {
        icon: LuCalendarClock,
        iconBg: "teal.100",
        iconFg: "teal.700",
        border: "teal.200",
        title: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)}はあと${action.daysLeft}日で締切`,
        sub: `提出${responseCount}人`,
        cta: { label: "希望を見る", palette: "teal", variant: "outline" },
      };
    }
    case "collecting": {
      const { periodStart, periodEnd, deadline, responseCount } = action.recruitment;
      return {
        icon: LuCalendarClock,
        iconBg: "teal.50",
        iconFg: "teal.700",
        border: "teal.100",
        title: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)}の提出待ち`,
        sub: `提出${responseCount}人・締切${formatDateShort(deadline)}まであと${action.daysLeft}日`,
        cta: { label: "希望を見る", palette: "teal", variant: "outline" },
      };
    }
  }
}
