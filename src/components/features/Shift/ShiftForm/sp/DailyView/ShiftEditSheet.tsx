import { Badge, Box, Field, Flex, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import dayjs from "dayjs";
import { useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { LuTrash2, LuX } from "react-icons/lu";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import type { SelectItemType } from "@/src/components/ui/Select";
import { Select } from "@/src/components/ui/Select";
import { DEFAULT_POSITION } from "../../constants";
import type { PositionType, ShiftData, StaffType, TimeRange } from "../../types";
import { normalizePositions, paintPosition } from "../../utils/shiftOperations";
import { minutesToTime, timeToMinutes } from "../../utils/timeConversion";
import { type AddTimeFormData, addTimeSchema } from "./ShiftEditSheet.schema";

type ShiftEditSheetProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  positions: PositionType[];
  timeRange: TimeRange;
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onBack?: () => void;
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

// 開始用オプション: endTime未満の選択肢（空なら全選択肢）
const getStartOptions = (allOptions: SelectItemType[], endTime: string) =>
  endTime ? allOptions.filter((opt) => timeToMinutes(opt.value) < timeToMinutes(endTime)) : allOptions;

// 終了用オプション: startTimeより後の選択肢（空なら全選択肢）
const getEndOptions = (allOptions: SelectItemType[], startTime: string) =>
  startTime ? allOptions.filter((opt) => timeToMinutes(opt.value) > timeToMinutes(startTime)) : allOptions;

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
  onBack,
  onShiftUpdate,
  onShiftDelete,
}: ShiftEditSheetProps) => {
  const timeOptions = useMemo(() => generateTimeOptions(timeRange), [timeRange]);
  const breakPosition = useMemo(() => findBreakPosition(positions), [positions]);

  const { initialStart, initialEnd } = useMemo(() => {
    if (!shift || shift.positions.length === 0) return { initialStart: "", initialEnd: "" };
    const starts = shift.positions.map((p) => timeToMinutes(p.start));
    const ends = shift.positions.map((p) => timeToMinutes(p.end));
    return { initialStart: minutesToTime(Math.min(...starts)), initialEnd: minutesToTime(Math.max(...ends)) };
  }, [shift]);
  const {
    handleSubmit: handleAddSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AddTimeFormData>({
    resolver: zodResolver(addTimeSchema),
    defaultValues: { startTime: initialStart, endTime: initialEnd },
  });
  const addStart = watch("startTime");
  const addEnd = watch("endTime");

  const dateLabel = dayjs(selectedDate).format("M/D(ddd)");

  const requestLabel = shift?.requestedTime
    ? `希望: ${shift.requestedTime.start} - ${shift.requestedTime.end}`
    : "希望: なし";

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
      const normalized = normalizePositions({
        positions: updated.positions,
        breakPosition,
      });
      onShiftUpdate({ ...updated, positions: normalized });
    },
    [currentShift, breakPosition, onShiftUpdate],
  );

  // セグメント削除
  const handleSegmentDelete = useCallback(
    (segmentId: string) => {
      const remaining = currentShift.positions.filter((p) => p.id !== segmentId);
      const normalized = normalizePositions({
        positions: remaining,
        breakPosition,
      });
      onShiftUpdate({ ...currentShift, positions: normalized });
    },
    [currentShift, breakPosition, onShiftUpdate],
  );

  const handleClearAll = useCallback(() => {
    onShiftDelete(staff.id);
  }, [staff.id, onShiftDelete]);

  const handleConfirm = useCallback(
    (data: AddTimeFormData) => {
      const startMin = timeToMinutes(data.startTime);
      const endMin = timeToMinutes(data.endTime);

      const painted = paintPosition({
        shift: currentShift,
        positionId: DEFAULT_POSITION.id,
        positionName: DEFAULT_POSITION.name,
        positionColor: DEFAULT_POSITION.color,
        startMinutes: startMin,
        endMinutes: endMin,
        segmentId: `seg-${Date.now()}`,
      });
      const normalized = normalizePositions({
        positions: painted.positions,
        breakPosition,
      });
      onShiftUpdate({ ...painted, positions: normalized });
      onOpenChange({ open: false });
    },
    [currentShift, breakPosition, onShiftUpdate, onOpenChange],
  );

  const onSubmit = useMemo(() => handleAddSubmit(handleConfirm), [handleAddSubmit, handleConfirm]);

  return (
    <BottomSheet
      title={`${staff.name}のシフト  ${dateLabel}`}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onBack={onBack}
      onSubmit={onSubmit}
      submitLabel="確定"
      overflowY="visible"
    >
      <VStack gap={4} align="stretch">
        {/* 希望時間 */}
        <Flex align="center" gap={2}>
          <Text fontSize="sm" color="gray.600">
            {requestLabel}
          </Text>
          {!staff.isSubmitted && (
            <Badge colorPalette="orange" size="sm">
              未提出
            </Badge>
          )}
        </Flex>

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

        {/* シフト追加 */}
        <Box borderTopWidth="1px" borderColor="gray.200" pt={3}>
          <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={2}>
            時間を追加
          </Text>
          <HStack gap={2} align="start">
            <Field.Root invalid={!!errors.startTime}>
              <Select
                items={getStartOptions(timeOptions, addEnd)}
                value={addStart}
                onChange={(v) => setValue("startTime", v, { shouldValidate: true })}
                size="sm"
                w="120px"
                usePortal={false}
                invalid={!!errors.startTime}
              />
              {errors.startTime && <Field.ErrorText>{errors.startTime.message}</Field.ErrorText>}
            </Field.Root>
            <Text fontSize="sm" color="gray.400" pt={2}>
              -
            </Text>
            <Field.Root invalid={!!errors.endTime}>
              <Select
                items={getEndOptions(timeOptions, addStart)}
                value={addEnd}
                onChange={(v) => setValue("endTime", v, { shouldValidate: true })}
                size="sm"
                w="120px"
                usePortal={false}
                invalid={!!errors.endTime}
              />
              {errors.endTime && <Field.ErrorText>{errors.endTime.message}</Field.ErrorText>}
            </Field.Root>
          </HStack>
        </Box>

        {/* 全削除 */}
        {currentShift.positions.length > 0 && (
          <Flex justify="flex-end">
            <IconButton aria-label="全削除" size="xs" variant="ghost" colorPalette="red" onClick={handleClearAll}>
              <LuTrash2 />
            </IconButton>
          </Flex>
        )}
      </VStack>
    </BottomSheet>
  );
};
