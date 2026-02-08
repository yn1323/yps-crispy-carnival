import { Box, Flex, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useCallback, useMemo, useState } from "react";
import { LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import type { SelectItemType } from "@/src/components/ui/Select";
import { Select } from "@/src/components/ui/Select";
import type { PositionType, ShiftData, StaffType, TimeRange } from "../../types";
import { normalizePositions, paintPosition } from "../../utils/shiftOperations";
import { minutesToTime, timeToMinutes } from "../../utils/timeConversion";

type ShiftEditSheetProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  positions: PositionType[];
  timeRange: TimeRange;
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onShiftUpdate: (updatedShift: ShiftData) => void;
  onShiftDelete: (staffId: string) => void;
};

// 時刻選択肢を生成
const generateTimeOptions = (timeRange: TimeRange) => {
  const options = [];
  for (let m = timeRange.start * 60; m <= timeRange.end * 60; m += timeRange.unit) {
    const label = minutesToTime(m);
    options.push({ value: label, label });
  }
  return options;
};

// 開始用オプション: endTime未満の選択肢
const getStartOptions = (allOptions: SelectItemType[], endTime: string) =>
  allOptions.filter((opt) => timeToMinutes(opt.value) < timeToMinutes(endTime));

// 終了用オプション: startTimeより後の選択肢
const getEndOptions = (allOptions: SelectItemType[], startTime: string) =>
  allOptions.filter((opt) => timeToMinutes(opt.value) > timeToMinutes(startTime));

// 休憩ポジションを取得
const findBreakPosition = (positions: PositionType[]) => {
  const bp = positions.find((p) => p.name === "休憩");
  return bp ? { id: bp.id, name: bp.name, color: bp.color } : { id: "break", name: "休憩", color: "#6b7280" };
};

export const ShiftEditSheet = ({
  staff,
  shift,
  positions,
  timeRange,
  selectedDate,
  isOpen,
  onOpenChange,
  onShiftUpdate,
  onShiftDelete,
}: ShiftEditSheetProps) => {
  const timeOptions = useMemo(() => generateTimeOptions(timeRange), [timeRange]);
  const breakPosition = useMemo(() => findBreakPosition(positions), [positions]);
  const positionOptions = useMemo(
    () => positions.filter((p) => p.name !== "休憩").map((p) => ({ value: p.id, label: p.name })),
    [positions],
  );

  // 追加用のローカルstate
  const defaultStart = minutesToTime(timeRange.start * 60);
  const defaultEnd = minutesToTime(timeRange.start * 60 + timeRange.unit);
  const [addPositionId, setAddPositionId] = useState(positionOptions[0]?.value ?? "");
  const [addStart, setAddStart] = useState(defaultStart);
  const [addEnd, setAddEnd] = useState(defaultEnd);

  const dateLabel = dayjs(selectedDate).format("M/D(ddd)");

  // 希望時間テキスト
  const requestLabel = (() => {
    if (!staff.isSubmitted) return "未提出";
    if (!shift?.requestedTime) return "希望: なし";
    return `希望: ${shift.requestedTime.start} - ${shift.requestedTime.end}`;
  })();

  // 現在のshift（なければ空で作る）
  const currentShift: ShiftData = shift ?? {
    id: `shift-${staff.id}-${selectedDate}`,
    staffId: staff.id,
    staffName: staff.name,
    date: selectedDate,
    requestedTime: null,
    positions: [],
  };

  // 非休憩セグメントのみ表示（休憩は自動挿入のため非表示）
  const visibleSegments = currentShift.positions.filter((p) => p.positionId !== breakPosition.id);

  // セグメント時刻変更
  const handleSegmentTimeChange = useCallback(
    (segmentId: string, edge: "start" | "end", newTime: string) => {
      const updated = {
        ...currentShift,
        positions: currentShift.positions.map((seg) => {
          if (seg.id !== segmentId) return seg;
          return edge === "start" ? { ...seg, start: newTime } : { ...seg, end: newTime };
        }),
      };
      const normalized = normalizePositions({ positions: updated.positions, breakPosition });
      onShiftUpdate({ ...updated, positions: normalized });
    },
    [currentShift, breakPosition, onShiftUpdate],
  );

  // セグメント削除
  const handleSegmentDelete = useCallback(
    (segmentId: string) => {
      const remaining = currentShift.positions.filter((p) => p.id !== segmentId);
      const normalized = normalizePositions({ positions: remaining, breakPosition });
      onShiftUpdate({ ...currentShift, positions: normalized });
    },
    [currentShift, breakPosition, onShiftUpdate],
  );

  // ポジション追加
  const handleAdd = useCallback(() => {
    const pos = positions.find((p) => p.id === addPositionId);
    if (!pos) return;

    const startMin = timeToMinutes(addStart);
    const endMin = timeToMinutes(addEnd);
    if (startMin >= endMin) return;

    const painted = paintPosition({
      shift: currentShift,
      positionId: pos.id,
      positionName: pos.name,
      positionColor: pos.color,
      startMinutes: startMin,
      endMinutes: endMin,
      segmentId: `seg-${Date.now()}`,
    });
    const normalized = normalizePositions({ positions: painted.positions, breakPosition });
    onShiftUpdate({ ...painted, positions: normalized });
  }, [currentShift, positions, addPositionId, addStart, addEnd, breakPosition, onShiftUpdate]);

  // 全削除
  const handleClearAll = useCallback(() => {
    onShiftDelete(staff.id);
  }, [staff.id, onShiftDelete]);

  const canAdd = addPositionId && timeToMinutes(addStart) < timeToMinutes(addEnd);

  return (
    <BottomSheet title={`${staff.name}のシフト  ${dateLabel}`} isOpen={isOpen} onOpenChange={onOpenChange}>
      <VStack gap={4} align="stretch">
        {/* 希望時間 */}
        <Text fontSize="sm" color="gray.600">
          {requestLabel}
        </Text>

        {/* 割当ポジション一覧 */}
        {visibleSegments.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={2}>
              割当ポジション
            </Text>
            <VStack gap={2} align="stretch">
              {visibleSegments.map((seg) => (
                <Flex key={seg.id} align="center" gap={2}>
                  <Box w="12px" h="12px" borderRadius="sm" bg={seg.color} flexShrink={0} />
                  <Text fontSize="sm" minW="60px" flexShrink={0}>
                    {seg.positionName}
                  </Text>
                  <Select
                    items={getStartOptions(timeOptions, seg.end)}
                    value={seg.start}
                    onChange={(v) => handleSegmentTimeChange(seg.id, "start", v)}
                    size="sm"
                    w="100px"
                    usePortal={false}
                  />
                  <Text fontSize="sm" color="gray.400">
                    -
                  </Text>
                  <Select
                    items={getEndOptions(timeOptions, seg.start)}
                    value={seg.end}
                    onChange={(v) => handleSegmentTimeChange(seg.id, "end", v)}
                    size="sm"
                    w="100px"
                    usePortal={false}
                  />
                  <IconButton
                    aria-label="削除"
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    onClick={() => handleSegmentDelete(seg.id)}
                  >
                    <LuX />
                  </IconButton>
                </Flex>
              ))}
            </VStack>
          </Box>
        )}

        {/* ポジション追加 */}
        <Box borderTopWidth="1px" borderColor="gray.200" pt={3}>
          <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={2}>
            ポジション追加
          </Text>
          <VStack gap={2} align="stretch">
            <Select
              items={positionOptions}
              value={addPositionId}
              onChange={setAddPositionId}
              size="sm"
              placeholder="ポジション"
              usePortal={false}
            />
            <HStack gap={2}>
              <Select
                items={getStartOptions(timeOptions, addEnd)}
                value={addStart}
                onChange={setAddStart}
                size="sm"
                w="120px"
                usePortal={false}
              />
              <Text fontSize="sm" color="gray.400">
                -
              </Text>
              <Select
                items={getEndOptions(timeOptions, addStart)}
                value={addEnd}
                onChange={setAddEnd}
                size="sm"
                w="120px"
                usePortal={false}
              />
              <IconButton
                aria-label="追加"
                size="sm"
                colorPalette="blue"
                variant="solid"
                onClick={handleAdd}
                disabled={!canAdd}
              >
                <LuPlus />
              </IconButton>
            </HStack>
          </VStack>
        </Box>

        {/* フッター */}
        <Flex justify="space-between" borderTopWidth="1px" borderColor="gray.200" pt={3}>
          <IconButton
            aria-label="全削除"
            size="sm"
            variant="ghost"
            colorPalette="red"
            onClick={handleClearAll}
            disabled={currentShift.positions.length === 0}
          >
            <LuTrash2 />
          </IconButton>
        </Flex>
      </VStack>
    </BottomSheet>
  );
};
