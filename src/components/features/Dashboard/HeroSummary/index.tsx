import { Badge, Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import {
  LuArrowRight,
  LuCalendarClock,
  LuCalendarDays,
  LuCircleAlert,
  LuCircleCheck,
  LuPlus,
  LuSparkles,
  LuUsers,
} from "react-icons/lu";
import { formatShiftTimeRange } from "@/src/components/features/Dashboard/DashboardContent/formatShiftTimeRange";
import type { Recruitment } from "@/src/components/features/Dashboard/types";
import { Button } from "@/src/components/ui/Button";
import { formatDateShort } from "@/src/domains/shift/date";
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

            <HStack display={{ base: "none", md: "flex" }} gap={2.5} color="fg.muted" flexShrink={0}>
              <Text fontSize="sm" fontWeight="medium" whiteSpace="nowrap">
                営業時間
              </Text>
              <Text fontSize={{ base: "md", lg: "lg" }} whiteSpace="nowrap">
                {formatShiftTimeRange(shop.shiftStartTime, shop.shiftEndTime)}
              </Text>
            </HStack>
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

      <Stack gap={{ base: 3, lg: 4 }}>
        <HStack gap={2.5} align="center">
          <Box fontSize={{ base: "xl", lg: "2xl" }} flexShrink={0}>
            <LuCircleCheck />
          </Box>
          <Heading as="h2" textStyle="sectionTitle" color="gray.900">
            今やること
          </Heading>
        </HStack>

        <ActionCard action={action} onOpenShiftBoard={onOpenShiftBoard} onCreateRecruitment={onCreateRecruitment} />
      </Stack>
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
        <Heading as="h1" textStyle="sectionTitle" color="gray.900" letterSpacing="-0.01em">
          お店の情報を登録しましょう
        </Heading>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          お店の名前とシフト時間を入れるだけで始められます。
        </Text>
      </Stack>
      <Flex>
        <Button colorPalette="teal" size="md" onClick={onSetupClick} gap={1.5}>
          お店を登録する
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
        title="次の募集をつくりましょう"
        metaItems={[{ label: "募集中のシフトなし" }]}
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
      metaItems={view.metaItems}
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
  metaItems: MetaItem[];
  cta: { label: string; icon?: IconType; palette: "teal" | "orange"; variant: "solid" | "outline" };
  onClick: () => void;
};

type MetaItem = {
  icon?: IconType;
  label: string;
  emphasis?: boolean;
};

const SlimCard = ({ icon: Icon, iconBg, iconFg, border, title, metaItems, cta, onClick }: SlimCardProps) => (
  <Flex
    bg="teal.50/30"
    borderRadius="xl"
    borderWidth="1px"
    borderColor={border}
    boxShadow="xs"
    px={{ base: 4, md: 6, lg: 7 }}
    py={{ base: 5, lg: 6 }}
    gap={{ base: 4, md: 6 }}
    align={{ base: "stretch", md: "center" }}
    direction={{ base: "column", md: "row" }}
  >
    <HStack gap={{ base: 3, md: 5 }} flex={1} minW={0}>
      <Flex
        boxSize={{ base: "48px", md: "80px" }}
        borderRadius="full"
        bg={iconBg}
        color={iconFg}
        align="center"
        justify="center"
        flexShrink={0}
      >
        <Icon size={32} />
      </Flex>
      <Stack gap={1.5} minW={0}>
        <Text fontSize={{ base: "lg", md: "2xl" }} fontWeight="bold" color="gray.900" lineHeight="short">
          {title}
        </Text>
        <HStack gap={2} wrap="wrap" pt={1}>
          {metaItems.map((item) => (
            <MetaChip key={item.label} item={item} />
          ))}
        </HStack>
      </Stack>
    </HStack>
    <Button
      colorPalette={cta.palette}
      variant={cta.variant}
      size={{ base: "sm", md: "md" }}
      gap={1.5}
      fontWeight="semibold"
      alignSelf={{ base: "stretch", md: "center" }}
      flexShrink={0}
      onClick={onClick}
    >
      {cta.icon && <cta.icon />}
      {cta.label}
      {!cta.icon && <LuArrowRight />}
    </Button>
  </Flex>
);

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
  border: string;
  title: string;
  metaItems: MetaItem[];
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
        title: "シフトを調整しましょう",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount),
          { icon: LuCalendarClock, label: `締切 ${formatDateShort(deadline)}`, emphasis: true },
        ],
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
        title: "今日中に希望を確認しましょう",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount),
          { icon: LuCalendarClock, label: "今日が締切", emphasis: true },
        ],
        cta: { label: "希望を見る", palette: "orange", variant: "solid" },
      };
    }
    case "deadline-soon": {
      const { periodStart, periodEnd, responseCount } = action.recruitment;
      return {
        icon: LuCalendarClock,
        iconBg: "teal.100",
        iconFg: "teal.700",
        border: "teal.200",
        title: "シフト希望を確認しましょう",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount),
          { icon: LuCalendarClock, label: `締切まで${action.daysLeft}日`, emphasis: true },
        ],
        cta: { label: "希望を見る", palette: "teal", variant: "outline" },
      };
    }
    case "collecting": {
      const { periodStart, periodEnd, responseCount } = action.recruitment;
      return {
        icon: LuCalendarClock,
        iconBg: "teal.50",
        iconFg: "teal.700",
        border: "teal.100",
        title: "シフト回収中です",
        metaItems: [
          createPeriodMeta(periodStart, periodEnd),
          createResponseMeta(responseCount),
          { icon: LuCalendarClock, label: `締切まで${action.daysLeft}日` },
        ],
        cta: { label: "希望を見る", palette: "teal", variant: "outline" },
      };
    }
  }
}

function createPeriodMeta(periodStart: string, periodEnd: string): MetaItem {
  return { icon: LuCalendarDays, label: `${formatDateShort(periodStart)}〜${formatDateShort(periodEnd)}` };
}

function createResponseMeta(responseCount: number): MetaItem {
  return { icon: LuUsers, label: `提出${responseCount}人` };
}
