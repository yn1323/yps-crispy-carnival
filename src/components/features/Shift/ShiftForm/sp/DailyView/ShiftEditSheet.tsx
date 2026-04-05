import { Badge, Field, Flex, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { LuTrash2 } from "react-icons/lu";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import type { SelectItemType } from "@/src/components/ui/Select";
import { Select } from "@/src/components/ui/Select";
import { BREAK_POSITION, DEFAULT_POSITION } from "../../constants";
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

const generateTimeOptions = (timeRange: TimeRange) => {
  const options = [];
  for (let m = timeRange.start * 60; m <= timeRange.end * 60; m += timeRange.unit) {
    const label = minutesToTime(m);
    options.push({ value: label, label });
  }
  return options;
};

const getStartOptions = (allOptions: SelectItemType[], endTime: string) =>
  endTime ? allOptions.filter((opt) => timeToMinutes(opt.value) < timeToMinutes(endTime)) : allOptions;

const getEndOptions = (allOptions: SelectItemType[], startTime: string) =>
  startTime ? allOptions.filter((opt) => timeToMinutes(opt.value) > timeToMinutes(startTime)) : allOptions;

const findBreakPosition = (positions: PositionType[]) => {
  const bp = positions.find((p) => p.name === BREAK_POSITION.name);
  return bp ? { id: bp.id, name: bp.name, color: bp.color } : { ...BREAK_POSITION };
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
    return {
      initialStart: minutesToTime(Math.min(...starts)),
      initialEnd: minutesToTime(Math.max(...ends)),
    };
  }, [shift]);

  const {
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AddTimeFormData>({
    resolver: zodResolver(addTimeSchema),
    defaultValues: { startTime: initialStart, endTime: initialEnd },
  });

  // shift（スタッフ）切り替え時にフォームをリセット
  useEffect(() => {
    reset({ startTime: initialStart, endTime: initialEnd });
  }, [initialStart, initialEnd, reset]);

  const startTime = watch("startTime");
  const endTime = watch("endTime");

  const dateLabel = dayjs(selectedDate).format("M/D(ddd)");

  const requestLabel = shift?.requestedTime
    ? `希望: ${shift.requestedTime.start} - ${shift.requestedTime.end}`
    : "希望: なし";

  const currentShift: ShiftData = shift ?? {
    id: `shift-${staff.id}-${selectedDate}`,
    staffId: staff.id,
    staffName: staff.name,
    date: selectedDate,
    requestedTime: null,
    positions: [],
  };

  const handleClearAll = useCallback(() => {
    onShiftDelete(staff.id);
    onOpenChange({ open: false });
  }, [staff.id, onShiftDelete, onOpenChange]);

  // 確定時にstoreへ反映
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

  const onSubmit = useMemo(() => handleSubmit(handleConfirm), [handleSubmit, handleConfirm]);

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

        <HStack gap={2} align="start">
          <Field.Root invalid={!!errors.startTime}>
            <Select
              items={getStartOptions(timeOptions, endTime)}
              value={startTime}
              onChange={(v) => setValue("startTime", v, { shouldValidate: true })}
              size="sm"
              usePortal={false}
              invalid={!!errors.startTime}
            />
            {errors.startTime && <Field.ErrorText>{errors.startTime.message}</Field.ErrorText>}
          </Field.Root>
          <Text fontSize="sm" color="gray.400" pt={2}>
            ~
          </Text>
          <Field.Root invalid={!!errors.endTime}>
            <Select
              items={getEndOptions(timeOptions, startTime)}
              value={endTime}
              onChange={(v) => setValue("endTime", v, { shouldValidate: true })}
              size="sm"
              usePortal={false}
              invalid={!!errors.endTime}
            />
            {errors.endTime && <Field.ErrorText>{errors.endTime.message}</Field.ErrorText>}
          </Field.Root>
          {currentShift.positions.length > 0 && (
            <Flex justify="flex-end">
              <IconButton
                aria-label="シフトを削除"
                size="xs"
                variant="ghost"
                colorPalette="red"
                onClick={handleClearAll}
              >
                <LuTrash2 />
              </IconButton>
            </Flex>
          )}
        </HStack>
      </VStack>
    </BottomSheet>
  );
};
