import { Box, Flex, Grid, Heading, Icon, Text } from "@chakra-ui/react";
import { ClientOnly } from "@tanstack/react-router";
import dayjs from "dayjs";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { LuCircleCheck } from "react-icons/lu";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { ConfirmShiftContent } from "@/src/components/shared/ShiftConfirmationContent";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import type { TourHandle } from "@/src/components/ui/Tour";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import { formatDateShort, formatDateTime, getWeekdayLabel } from "@/src/domains/shift/date";
import type { ShiftData, ViewMode } from "@/src/domains/shift/types";
import { DemoIntroTour } from "./DemoIntroTour";
import { DemoLauncherFab } from "./DemoLauncherFab";
import { mockDates, mockShifts, mockStaffs, mockTimeRange } from "./demoData";

type TourPhase = "idle" | "running" | "done";

const POSITIONS = [DEFAULT_POSITION];
const DEMO_SHOP_ID = "demo-shop";

type Props = {
  /** 週の起点日（YYYY-MM-DD）。デフォルトは来週の月曜。VRT 安定化のため Story 側で固定値を差し込める */
  baseDate?: string;
  headerStart?: ReactNode;
  height?: string;
};

/** SSG生成日を基準にした来週の月曜。server HTMLとhydration初回で同じ日付を使う。 */
function getNextMonday(): string {
  const today = dayjs(__BUILD_DATE_JST__);
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

export const DemoShiftBoardPage = ({ baseDate, headerStart, height = "100dvh" }: Props = {}) => {
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  const isConfirmed = confirmedAt !== null;

  const { dates, shifts: initialShifts } = useMemo(() => buildDemoShifts(baseDate ?? getNextMonday()), [baseDate]);
  const periodLabel = useMemo(() => generatePeriodLabel(dates), [dates]);
  const day1 = dates[0];

  const [shifts, setShifts] = useState<ShiftData[]>(initialShifts);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [tourPhase, setTourPhase] = useState<TourPhase>("idle");
  const tourRef = useRef<TourHandle>(null);

  const confirmModal = useDialog();

  const handleOpenConfirm = useCallback(() => {
    // モーダルを開く前に tour を止めて overlay を片付けさせる（unmount はしない）
    tourRef.current?.skip();
    setTourPhase("idle");
    confirmModal.open();
  }, [confirmModal]);

  const handleConfirm = useCallback(() => {
    // tour は handleOpenConfirm 時点で skip + idle 済み。確定後も FAB を出しておきたいので idle のまま
    setConfirmedAt(Date.now());
    confirmModal.close();
    showSuccessToast({ title: "確定後の画面を表示しました" });
  }, [confirmModal]);

  const handleTourCloseRequest = useCallback(() => {
    tourRef.current?.skip();
    setTourPhase("idle");
  }, []);

  const handleSaveDraft = useCallback(() => {
    showSuccessToast({ title: "保存しました" });
  }, []);

  const confirmTitle = isConfirmed ? "再通知後の画面を確認しますか？" : "確定後の画面を確認しますか？";

  return (
    <Flex direction="column" h={height} minH={0}>
      <Grid
        templateColumns="minmax(0, 1fr) auto minmax(0, 1fr)"
        alignItems="center"
        bg="white"
        px={{ base: 4, lg: 6 }}
        py={2}
        gap={4}
        flexShrink={0}
      >
        <Flex align="center" gap={4} minW={0}>
          {headerStart}
          <Heading as="h1" fontSize={{ base: "xs", lg: "sm" }} fontWeight={700} color="gray.800" whiteSpace="nowrap">
            勤務時間入力デモ
          </Heading>
        </Flex>
        <Text fontSize={{ base: "sm", lg: "md" }} fontWeight={600} color="gray.900" textAlign="center">
          {periodLabel}
        </Text>
        <Flex align="center" justify="flex-end" gap={3} minW={0}>
          {isConfirmed && (
            <Flex align="center" gap={1} flexShrink={0}>
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
          )}
          <Box
            role="note"
            w="420px"
            maxW="100%"
            px={3}
            py={1.5}
            bg="orange.50"
            borderWidth="1px"
            borderColor="orange.300"
            borderRadius="md"
          >
            <Text color="orange.900" fontSize="xs" fontWeight={700} lineHeight="1.5">
              このページはデモ画面です。
              <br />
              デモでの操作は保存されず、スタッフへの通知も送られません。
            </Text>
          </Box>
        </Flex>
      </Grid>

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
          onConfirm={handleOpenConfirm}
          onShiftsChange={setShifts}
          onViewModeChange={setViewMode}
        />
      </Box>

      <Dialog
        title={confirmTitle}
        isOpen={confirmModal.isOpen}
        onOpenChange={confirmModal.onOpenChange}
        onSubmit={handleConfirm}
        submitLabel={isConfirmed ? "再通知後の画面を見る" : "確定後の画面を見る"}
        onClose={confirmModal.close}
      >
        <ConfirmShiftContent
          staffCount={mockStaffs.length}
          periodLabel={periodLabel}
          notificationDescription="デモでの操作は保存されず、スタッフへの通知も送られません。"
        />
      </Dialog>

      <ClientOnly>
        {tourPhase === "idle" && viewMode === "daily" && (
          <DemoLauncherFab onStart={() => setTourPhase("running")} onDismiss={() => setTourPhase("done")} />
        )}

        {/* idle/running はマウント継続で run だけトグル。done で unmount する前に
            ref.skip() で portal を片付け済みにしておく（handleConfirm / handleTourCloseRequest） */}
        {tourPhase !== "done" && (
          <DemoIntroTour
            ref={tourRef}
            run={tourPhase === "running"}
            shifts={shifts}
            day1={day1}
            onClose={handleTourCloseRequest}
          />
        )}
      </ClientOnly>
    </Flex>
  );
};
