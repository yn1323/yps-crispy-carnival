import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import type { ShiftData } from "@/src/domains/shift/types";
import { useLockedDailyStaffOrder } from "../../hooks/useLockedDailyStaffOrder";
import {
  issueCountByDateAtom,
  restoreRememberedWorkPositionAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsForSelectedDateAtom,
  warningCountByDateAtom,
} from "../../stores";
import { DateRail } from "./DateRail";
import { DayTitle } from "./DayTitle";
import { ShiftGrid } from "./ShiftGrid";
import { ShiftPopover } from "./ShiftPopover";

export const DailyView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shiftsForSelectedDate = useAtomValue(shiftsForSelectedDateAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const issueCounts = useAtomValue(issueCountByDateAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);

  const { dates, isReadOnly, holidays, shopId, positions } = config;
  // 前にこの店舗で最後に選んだポジションを、次に入れるポジションへ戻す。店舗とポジションが読み込まれてから行う。
  const restoreRememberedWorkPosition = useSetAtom(restoreRememberedWorkPositionAtom);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 店舗かポジションが変わったときに戻し直すため、値の変化を見る。
  useEffect(() => {
    restoreRememberedWorkPosition();
  }, [restoreRememberedWorkPosition, shopId, positions]);
  const isShopClosedDate = holidays.includes(selectedDate);
  useLockedDailyStaffOrder(selectedDate);

  const [popoverShift, setPopoverShift] = useState<ShiftData | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);

  const handleShiftClick = useCallback(
    (shiftId: string, _positionId: string | null, e: React.MouseEvent) => {
      // 編集できる表示では、勤務のバーを押すと範囲を選ぶメニューが開く。勤務の欄は閲覧専用の表示でだけ開く。
      if (!isReadOnly) return;
      const shift = shiftsForSelectedDate.find((s) => s.id === shiftId);
      if (shift) {
        setPopoverShift(shift);
        setPopoverAnchor(e.currentTarget.getBoundingClientRect());
      }
    },
    [shiftsForSelectedDate, isReadOnly],
  );

  const handlePopoverClose = useCallback(() => {
    setPopoverShift(null);
    setPopoverAnchor(null);
  }, []);

  return (
    <Grid flex={1} minH={0} overflow="hidden" templateColumns="80px minmax(0, 1fr)">
      <DateRail
        dates={dates}
        selectedDate={selectedDate}
        onSelect={selectDate}
        holidays={holidays}
        issueCounts={issueCounts}
        warningCounts={warningCounts}
      />
      <Flex direction="column" minW={0} minH={0} overflow="hidden">
        <DayTitle date={selectedDate} holidays={holidays} positionControl="rangeAssign" />
        {isShopClosedDate ? (
          <Flex flex={1} minH={0} bg="gray.50" align="center" justify="center" direction="column" gap={2} px={6}>
            <Text fontSize="md" fontWeight="bold" color="gray.700">
              定休日
            </Text>
            <Text fontSize="sm" color="fg.muted" textAlign="center">
              この日は店舗の定休日のため、シフトを登録できません。
            </Text>
          </Flex>
        ) : (
          <Box flex={1} minH={0} overflow="hidden">
            <ShiftGrid onShiftClick={handleShiftClick} onStaffNameClick={() => {}} />
          </Box>
        )}
      </Flex>

      <ShiftPopover
        shift={popoverShift}
        anchorRect={popoverAnchor}
        isOpen={popoverShift !== null}
        onClose={handlePopoverClose}
      />
    </Grid>
  );
};
