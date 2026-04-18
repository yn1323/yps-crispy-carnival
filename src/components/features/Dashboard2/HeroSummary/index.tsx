import { Box, Button, Flex, HStack, IconButton, Stack, Text } from "@chakra-ui/react";
import { LuArrowRight, LuSettings } from "react-icons/lu";
import { formatShiftTimeRange } from "@/src/components/features/Dashboard/DashboardContent/formatShiftTimeRange";

type Shop = {
  name: string;
  shiftStartTime: string;
  shiftEndTime: string;
};

type Props = {
  shop: Shop | null;
  collectingCount: number;
  pastDeadlineCount: number;
  confirmedCount: number;
  staffCount: number;
  onEditClick: () => void;
  onSetupClick: () => void;
};

export const HeroSummary = ({
  shop,
  collectingCount,
  pastDeadlineCount,
  confirmedCount,
  staffCount,
  onEditClick,
  onSetupClick,
}: Props) => {
  if (!shop) {
    return (
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
        p={{ base: 6, lg: 8 }}
      >
        <Decoration />
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
      </Box>
    );
  }

  return (
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
      p={{ base: 5, lg: 7 }}
    >
      <Decoration />
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

        <Box
          borderRadius="xl"
          bg="white"
          borderWidth="1px"
          borderColor="blackAlpha.50"
          boxShadow="xs"
          px={{ base: 4, lg: 5 }}
          py={{ base: 3.5, lg: 4 }}
        >
          <Flex
            gap={{ base: 4, lg: 6 }}
            align={{ base: "flex-start", lg: "center" }}
            justify="space-between"
            wrap="wrap"
            direction={{ base: "column", sm: "row" }}
          >
            <HStack gap={{ base: 3, lg: 5 }} wrap="wrap">
              <StatChip dotColor="teal.500" label="募集中" value={collectingCount} />
              <StatChip dotColor="yellow.500" label="締切済み" value={pastDeadlineCount} />
              <StatChip dotColor="gray.400" label="確定" value={confirmedCount} />
            </HStack>
            <HStack gap={2.5}>
              <Box h="24px" w="1px" bg="blackAlpha.100" display={{ base: "none", sm: "block" }} />
              <StatChip dotColor="teal.300" label="スタッフ" value={staffCount} unit="名" />
            </HStack>
          </Flex>
        </Box>
      </Stack>
    </Box>
  );
};

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
    <Box as="span">{children}</Box>
  </HStack>
);

type StatChipProps = {
  dotColor: string;
  label: string;
  value: number;
  unit?: string;
};

const StatChip = ({ dotColor, label, value, unit = "件" }: StatChipProps) => (
  <HStack gap={2} align="baseline">
    <Box boxSize="8px" borderRadius="full" bg={dotColor} alignSelf="center" />
    <Text fontSize="xs" color="fg.muted" fontWeight="medium">
      {label}
    </Text>
    <HStack gap={0.5} align="baseline">
      <Text fontSize="xl" fontWeight="bold" color="gray.900" lineHeight="1">
        {value}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {unit}
      </Text>
    </HStack>
  </HStack>
);
