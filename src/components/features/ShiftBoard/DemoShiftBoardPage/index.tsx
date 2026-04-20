import { Box, Flex, Icon, Text, useBreakpointValue } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useCallback, useMemo, useState } from "react";
import { LuCircleCheck } from "react-icons/lu";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { DEFAULT_POSITION } from "@/src/components/features/Shift/ShiftForm/constants";
import type { ShiftData } from "@/src/components/features/Shift/ShiftForm/types";
import {
  formatDateShort,
  formatDateTime,
  getWeekdayLabel,
} from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { ConfirmShiftContent } from "../ConfirmShiftContent";
import { mockDates, mockShifts, mockStaffs, mockTimeRange } from "../mocks";

const POSITIONS = [DEFAULT_POSITION];
const DEMO_SHOP_ID = "demo-shop";

type Props = {
  /** 週の起点日（YYYY-MM-DD）。デフォルトは来週の月曜。VRT 安定化のため Story 側で固定値を差し込める */
  baseDate?: string;
};

/** 来週の月曜（ローカルタイム）。シフトは将来の予定を立てる用途なので、今週ではなく来週を起点にする */
function getNextMonday(): string {
  const today = dayjs();
  const diffToThisMonday = today.day() === 0 ? -6 : 1 - today.day();
  return today.add(diffToThisMonday + 7, "day").format("YYYY-MM-DD");
}

/** mockDates / mockShifts の date を baseDate 起点に再マッピングし、positionId も DEFAULT_POSITION に揃える */
function buildDemoShifts(baseDate: string): { dates: string[]; shifts: ShiftData[] } {
  const dates = mockDates.map((_, i) => dayjs(baseDate).add(i, "day").format("YYYY-MM-DD"));
  const dateMap = new Map<string, string>();
  mockDates.forEach((d, i) => {
    dateMap.set(d, dates[i]);
  });

  const shifts: ShiftData[] = mockShifts.map((shift) => {
    const newDate = dateMap.get(shift.date) ?? shift.date;
    return {
      ...shift,
      id: `shift-${shift.staffId}-${newDate}`,
      date: newDate,
      positions: shift.positions.map((segment) => ({
        ...segment,
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        color: DEFAULT_POSITION.color,
      })),
    };
  });

  return { dates, shifts };
}

function generatePeriodLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  const first = dates[0];
  const last = dates[dates.length - 1];
  return `${formatDateShort(first)}(${getWeekdayLabel(first)})〜${formatDateShort(last)}(${getWeekdayLabel(last)}) のシフト`;
}

export const DemoShiftBoardPage = ({ baseDate }: Props = {}) => {
  const isMobile = useBreakpointValue({ base: true, lg: false });
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  const isConfirmed = confirmedAt !== null;

  const { dates, shifts: initialShifts } = useMemo(() => buildDemoShifts(baseDate ?? getNextMonday()), [baseDate]);
  const periodLabel = useMemo(() => generatePeriodLabel(dates), [dates]);

  const confirmModal = useDialog();
  const Modal = isMobile ? BottomSheet : Dialog;

  const handleConfirm = useCallback(() => {
    setConfirmedAt(Date.now());
    confirmModal.close();
    toaster.create({ title: "確定しました", type: "success" });
  }, [confirmModal]);

  const handleSaveDraft = useCallback(() => {
    toaster.create({ title: "保存しました", type: "success" });
  }, []);

  const confirmTitle = isConfirmed ? "シフトを再通知しますか？" : "シフトを確定して通知しますか？";

  return (
    <Flex direction="column" h="100dvh" minH={0}>
      <Flex align="center" justify="space-between" bg="white" px={{ base: 4, lg: 6 }} py={2} flexShrink={0}>
        <Box w={{ base: "40px", lg: "80px" }} />
        <Text fontSize={{ base: "sm", lg: "md" }} fontWeight={600} color="gray.900">
          {periodLabel}
        </Text>
        {isConfirmed && confirmedAt !== null ? (
          <Flex align="center" gap={1}>
            <Icon color="green.600" boxSize={3.5}>
              <LuCircleCheck />
            </Icon>
            <Text fontSize="xs" color="green.600" display={{ base: "none", lg: "inline" }}>
              確定済み（{formatDateTime(new Date(confirmedAt))}）
            </Text>
            <Text fontSize="2xs" color="green.600" display={{ base: "inline", lg: "none" }}>
              確定済み
            </Text>
          </Flex>
        ) : (
          <Box w={{ base: "40px", lg: "80px" }} />
        )}
      </Flex>

      <Box flex={1} minH={0}>
        <ShiftForm
          shopId={DEMO_SHOP_ID}
          staffs={mockStaffs}
          positions={POSITIONS}
          initialShifts={initialShifts}
          dates={dates}
          timeRange={mockTimeRange}
          isConfirmed={isConfirmed}
          onSaveDraft={handleSaveDraft}
          onConfirm={confirmModal.open}
        />
      </Box>

      <Modal
        title={confirmTitle}
        isOpen={confirmModal.isOpen}
        onOpenChange={confirmModal.onOpenChange}
        onSubmit={handleConfirm}
        submitLabel="確定して通知する"
        onClose={confirmModal.close}
      >
        <ConfirmShiftContent staffCount={mockStaffs.length} periodLabel={periodLabel} />
      </Modal>
    </Flex>
  );
};
