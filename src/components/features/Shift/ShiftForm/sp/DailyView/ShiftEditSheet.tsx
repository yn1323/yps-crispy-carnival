import { Alert, Badge, Field, Flex, HStack, Text, VisuallyHidden, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { LuTrash2 } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { SelectItemType } from "@/src/components/ui/Select";
import { Select } from "@/src/components/ui/Select";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { formatShiftClockTimeRange, generateShiftTimeOptions, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";
import { getEditableEndMinutes, getEditableStartMinutes } from "../../timelineGeometry";
import { type AddTimeFormData, addTimeSchema } from "./ShiftEditSheet.schema";
import { buildSPShiftTimeEditResult, getSPShiftEditState } from "./script";

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

export const generateTimeOptions = (timeRange: TimeRange) => {
  return generateShiftTimeOptions({
    startMinutes: getEditableStartMinutes(timeRange),
    endMinutes: getEditableEndMinutes(timeRange),
    stepMinutes: timeRange.unit,
  }) satisfies SelectItemType[];
};

const getStartOptions = (allOptions: SelectItemType[], endTime: string) =>
  endTime ? allOptions.filter((opt) => timeToMinutes(opt.value) < timeToMinutes(endTime)) : allOptions;

const getEndOptions = (allOptions: SelectItemType[], startTime: string) =>
  startTime ? allOptions.filter((opt) => timeToMinutes(opt.value) > timeToMinutes(startTime)) : allOptions;

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
  const editState = useMemo(() => getSPShiftEditState(shift), [shift]);
  const initialStart = editState.kind === "editable" ? editState.initialStart : "";
  const initialEnd = editState.kind === "editable" ? editState.initialEnd : "";
  const hasMultipleWorkPositions = editState.kind === "multiple";

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

  const dateLabel = formatDateWithWeekday(selectedDate);

  const requestTimes = shift?.requestedTimes ?? (shift?.requestedTime ? [shift.requestedTime] : []);
  const requestLabel =
    requestTimes.length > 0
      ? `希望：${requestTimes.map((request) => formatShiftClockTimeRange(request.start, request.end)).join(" / ")}`
      : "希望：なし";

  const currentShift: ShiftData = useMemo(
    () =>
      shift ?? {
        id: `shift-${staff.id}-${selectedDate}`,
        staffId: staff.id,
        staffName: staff.name,
        date: selectedDate,
        requestedTime: null,
        positions: [],
      },
    [selectedDate, shift, staff.id, staff.name],
  );

  const handleClearAll = useCallback(() => {
    onShiftDelete(staff.id);
    onOpenChange({ open: false });
  }, [staff.id, onShiftDelete, onOpenChange]);

  // 確定時にstoreへ反映
  const handleConfirm = useCallback(
    (data: AddTimeFormData) => {
      const result = buildSPShiftTimeEditResult({
        shift: currentShift,
        positions,
        startTime: data.startTime,
        endTime: data.endTime,
        segmentId: `seg-${Date.now()}`,
      });
      if (result.kind === "multiple") return;

      onShiftUpdate(result.shift);
      onOpenChange({ open: false });
    },
    [currentShift, positions, onShiftUpdate, onOpenChange],
  );

  const onSubmit = useMemo(() => handleSubmit(handleConfirm), [handleSubmit, handleConfirm]);

  return (
    <Dialog
      title={`${staff.name}のシフト  ${dateLabel}`}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={() => onOpenChange({ open: false })}
      onSubmit={onSubmit}
      submitLabel="確定"
      isSubmitDisabled={hasMultipleWorkPositions}
      modal={false}
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

        {editState.kind === "multiple" ? (
          <Alert.Root status="info" alignItems="flex-start">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>現在の勤務時間</Alert.Title>
              <Alert.Description>
                <VStack align="stretch" gap={2} mt={1}>
                  <HStack gap={2} flexWrap="wrap">
                    {editState.workPositions.map((position) => (
                      <Badge key={position.id} colorPalette="gray" variant="subtle">
                        {formatShiftClockTimeRange(position.start, position.end)}
                      </Badge>
                    ))}
                  </HStack>
                  <Text fontSize="sm">
                    複数の勤務時間はスマートフォンでは編集できません。PC版のシフト表から変更してください。
                  </Text>
                </VStack>
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        ) : (
          <HStack gap={2} align="start">
            <Field.Root invalid={!!errors.startTime}>
              <Field.Label>
                <VisuallyHidden>開始時間</VisuallyHidden>
              </Field.Label>
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
              <Field.Label>
                <VisuallyHidden>終了時間</VisuallyHidden>
              </Field.Label>
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
          </HStack>
        )}

        {currentShift.positions.length > 0 && (
          <Flex justify="flex-end" align="center" gap={1}>
            <Text fontSize="xs" color="gray.500">
              この日の勤務時間をすべて削除
            </Text>
            <IconButton
              aria-label="この日の勤務時間をすべて削除"
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={handleClearAll}
            >
              <LuTrash2 />
            </IconButton>
          </Flex>
        )}
      </VStack>
    </Dialog>
  );
};
