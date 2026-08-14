import { Badge, Box, Flex, HStack, Text } from "@chakra-ui/react";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { APP_PROTOTYPE_FIXTURE, APP_PROTOTYPE_IDS } from "./fixtures";

const BOARD_DATES = [
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-20",
  "2026-08-21",
  "2026-08-22",
  "2026-08-23",
  "2026-08-24",
];

const BOARD_STAFFS: StaffType[] = APP_PROTOTYPE_FIXTURE.people.map((person, index) => ({
  id: `sample-board-staff-${index + 1}`,
  name: person.name,
  isSubmitted: index !== 1,
  displayOrder: index,
}));

const BOARD_POSITION: PositionType = {
  id: "sample-board-position",
  name: "シフト",
  color: "#0f766e",
  isDefault: true,
};

const BOARD_SHIFTS: ShiftData[] = [
  {
    id: "sample-board-shift-1",
    staffId: BOARD_STAFFS[0].id,
    staffName: BOARD_STAFFS[0].name,
    date: BOARD_DATES[0],
    requestedTime: { start: "09:00", end: "15:00" },
    positions: [
      {
        id: "sample-board-segment-1",
        positionId: BOARD_POSITION.id,
        positionName: BOARD_POSITION.name,
        color: BOARD_POSITION.color,
        start: "09:00",
        end: "15:00",
      },
    ],
  },
  {
    id: "sample-board-shift-2",
    staffId: BOARD_STAFFS[1].id,
    staffName: BOARD_STAFFS[1].name,
    date: BOARD_DATES[0],
    requestedTime: null,
    positions: [],
  },
  {
    id: "sample-board-shift-3",
    staffId: BOARD_STAFFS[2].id,
    staffName: BOARD_STAFFS[2].name,
    date: BOARD_DATES[0],
    requestedTime: { start: "15:00", end: "21:00" },
    positions: [
      {
        id: "sample-board-segment-3",
        positionId: BOARD_POSITION.id,
        positionName: BOARD_POSITION.name,
        color: BOARD_POSITION.color,
        start: "15:00",
        end: "21:00",
      },
    ],
  },
];

export function PrototypeShiftBoardView() {
  return (
    <Flex
      as="main"
      direction="column"
      h={{
        base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
        md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
      }}
      minH={0}
      bg="gray.50"
    >
      <Flex
        align="center"
        justify="space-between"
        gap={3}
        px={{ base: 3, md: 5 }}
        py={2.5}
        bg="white"
        borderBottomWidth="1px"
        borderColor="blackAlpha.100"
        flexShrink={0}
      >
        <HStack gap={2} minW={0} wrap="wrap">
          <Badge colorPalette="orange" variant="subtle" borderRadius="full" px={2.5}>
            要シフト調整
          </Badge>
          <Text color="fg.muted" fontSize="sm">
            提出 2/3人
          </Text>
        </HStack>
        <Text color="fg.muted" fontSize="sm" fontWeight="semibold" truncate>
          {APP_PROTOTYPE_FIXTURE.currentShop.name}
        </Text>
      </Flex>

      <Box flex={1} minH={0}>
        <ShiftForm
          shopId={APP_PROTOTYPE_IDS.shop}
          staffs={BOARD_STAFFS}
          positions={[BOARD_POSITION]}
          initialShifts={BOARD_SHIFTS}
          dates={BOARD_DATES}
          timeRange={{ start: 9, end: 21, unit: 30 }}
          holidays={[]}
          submissionPattern={{ kind: "time", startTime: "09:00", endTime: "21:00" }}
          isReadOnly
          initialViewMode="daily"
        />
      </Box>
    </Flex>
  );
}
