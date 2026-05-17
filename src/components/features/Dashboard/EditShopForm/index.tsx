import { Box, Field, Flex, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/Select";
import {
  type EditShopFormData,
  editShopSchema,
  minutesToTime,
  type RegularClosedDay,
  type ShiftSubmissionPattern,
  type ShiftTypeOption,
  timeToMinutes,
} from "./index";

type Props = {
  defaultValues: EditShopFormData;
  onSubmit: (data: EditShopFormData) => void;
};

const WEEKDAYS: { value: RegularClosedDay; label: string; ariaLabel: string }[] = [
  { value: "sun", label: "日", ariaLabel: "日曜日" },
  { value: "mon", label: "月", ariaLabel: "月曜日" },
  { value: "tue", label: "火", ariaLabel: "火曜日" },
  { value: "wed", label: "水", ariaLabel: "水曜日" },
  { value: "thu", label: "木", ariaLabel: "木曜日" },
  { value: "fri", label: "金", ariaLabel: "金曜日" },
  { value: "sat", label: "土", ariaLabel: "土曜日" },
];

const sortRegularClosedDays = (days: RegularClosedDay[]) =>
  WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.value);

function generateTimeOptions(maxMinutes: number): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let m = 0; m <= maxMinutes; m += 30) {
    const value = minutesToTime(m);
    if (m >= 24 * 60) {
      const displayH = Math.floor(m / 60) - 24;
      const displayM = m % 60;
      options.push({
        value,
        label: `翌 ${displayH.toString().padStart(2, "0")}:${displayM.toString().padStart(2, "0")}`,
      });
    } else {
      options.push({ value, label: value });
    }
  }
  return options;
}

const ALL_START_OPTIONS = generateTimeOptions(23 * 60 + 30);
const ALL_END_OPTIONS = generateTimeOptions(29 * 60);

const SUBMISSION_PATTERN_OPTIONS: Array<{
  kind: ShiftSubmissionPattern["kind"];
  label: string;
  description: string;
}> = [
  { kind: "time", label: "時間指定", description: "スタッフが日ごとに開始・終了時間を選びます。" },
  { kind: "dateOnly", label: "日ごと", description: "出勤できる日だけ集め、店舗のシフト時間帯全体で扱います。" },
  { kind: "shiftType", label: "勤務区分", description: "朝番・遅番など、決めた区分から選んでもらいます。" },
];

const DEFAULT_TIME_PATTERN: Extract<ShiftSubmissionPattern, { kind: "time" }> = {
  kind: "time",
  startTime: "09:00",
  endTime: "22:00",
};

const createShiftTypeOption = (index: number): ShiftTypeOption => ({
  id: `shift-type-${Date.now()}-${index}`,
  name: "",
  startTime: "09:00",
  endTime: "18:00",
  sortOrder: index,
});

const normalizeShiftTypeOptions = (options: ShiftTypeOption[]): ShiftTypeOption[] =>
  options.map((option, index) => ({ ...option, sortOrder: index }));

export const EditShopForm = ({ defaultValues, onSubmit }: Props) => {
  const [regularClosedDays, setRegularClosedDays] = useState<RegularClosedDay[]>(defaultValues.regularClosedDays);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EditShopFormData>({
    resolver: zodResolver(editShopSchema),
    defaultValues,
  });

  const submissionPattern = watch("submissionPattern");
  const timeStart = submissionPattern.kind === "time" ? submissionPattern.startTime : DEFAULT_TIME_PATTERN.startTime;
  const timeEnd = submissionPattern.kind === "time" ? submissionPattern.endTime : DEFAULT_TIME_PATTERN.endTime;

  const timeEndOptions = useMemo(() => {
    const startMin = timeToMinutes(timeStart);
    return ALL_END_OPTIONS.filter((opt) => timeToMinutes(opt.value) > startMin);
  }, [timeStart]);

  const timeStartOptions = useMemo(() => {
    const endMin = timeToMinutes(timeEnd);
    return ALL_START_OPTIONS.filter((opt) => timeToMinutes(opt.value) < endMin);
  }, [timeEnd]);

  const toggleRegularClosedDay = (day: RegularClosedDay) => {
    setRegularClosedDays((current) => {
      const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day];
      return sortRegularClosedDays(next);
    });
  };

  const selectedClosedDayLabels = WEEKDAYS.filter((day) => regularClosedDays.includes(day.value)).map(
    (day) => day.label,
  );
  const shiftTypeOptions = submissionPattern.kind === "shiftType" ? submissionPattern.options : [];

  const setSubmissionPattern = (next: ShiftSubmissionPattern) => {
    setValue("submissionPattern", next, { shouldDirty: true, shouldValidate: true });
  };

  const handleSubmissionPatternChange = (kind: ShiftSubmissionPattern["kind"]) => {
    if (kind === "time") {
      setSubmissionPattern(
        submissionPattern.kind === "time"
          ? submissionPattern
          : { kind: "time", startTime: DEFAULT_TIME_PATTERN.startTime, endTime: DEFAULT_TIME_PATTERN.endTime },
      );
      return;
    }
    if (kind === "shiftType") {
      setSubmissionPattern({
        kind,
        options:
          submissionPattern.kind === "shiftType" && submissionPattern.options.length > 0
            ? submissionPattern.options
            : [createShiftTypeOption(0)],
      });
      return;
    }
    setSubmissionPattern({ kind: "dateOnly" });
  };

  const updateShiftTypeOption = (index: number, patch: Partial<ShiftTypeOption>) => {
    if (submissionPattern.kind !== "shiftType") return;
    setSubmissionPattern({
      kind: "shiftType",
      options: normalizeShiftTypeOptions(
        submissionPattern.options.map((option, optionIndex) =>
          optionIndex === index ? { ...option, ...patch } : option,
        ),
      ),
    });
  };

  const addShiftTypeOption = () => {
    if (submissionPattern.kind !== "shiftType") return;
    setSubmissionPattern({
      kind: "shiftType",
      options: normalizeShiftTypeOptions([
        ...submissionPattern.options,
        createShiftTypeOption(submissionPattern.options.length),
      ]),
    });
  };

  const removeShiftTypeOption = (index: number) => {
    if (submissionPattern.kind !== "shiftType") return;
    setSubmissionPattern({
      kind: "shiftType",
      options: normalizeShiftTypeOptions(submissionPattern.options.filter((_, optionIndex) => optionIndex !== index)),
    });
  };

  return (
    <form
      id="edit-shop-form"
      noValidate
      onSubmit={handleSubmit((data) =>
        onSubmit({
          ...data,
          regularClosedDays: sortRegularClosedDays(regularClosedDays),
          submissionPattern:
            data.submissionPattern.kind === "shiftType"
              ? { kind: "shiftType", options: normalizeShiftTypeOptions(data.submissionPattern.options) }
              : data.submissionPattern,
        }),
      )}
    >
      <Stack gap={5}>
        <Field.Root invalid={!!errors.shopName}>
          <Field.Label>お店の名前</Field.Label>
          <Input placeholder="例：居酒屋たなか" {...register("shopName")} />
          {errors.shopName && <Field.ErrorText>{errors.shopName.message}</Field.ErrorText>}
        </Field.Root>
        <Stack gap={3}>
          <Box>
            <Text fontSize="sm" fontWeight="medium" color="fg.default">
              希望シフトの提出方法
            </Text>
            <Text mt={1} fontSize="xs" color="fg.muted" lineHeight="tall">
              次に作成する募集から、この方法でスタッフに希望を出してもらいます。
            </Text>
          </Box>
          <Stack gap={2}>
            {SUBMISSION_PATTERN_OPTIONS.map((option) => {
              const isSelected = submissionPattern.kind === option.kind;
              return (
                <Button
                  key={option.kind}
                  type="button"
                  h="auto"
                  justifyContent="flex-start"
                  textAlign="left"
                  variant="outline"
                  borderColor={isSelected ? "teal.500" : "border.default"}
                  bg={isSelected ? "teal.50" : "white"}
                  color="fg.default"
                  px={4}
                  py={3}
                  onClick={() => handleSubmissionPatternChange(option.kind)}
                  _hover={{ bg: isSelected ? "teal.50" : "gray.50" }}
                >
                  <Stack gap={1} align="flex-start">
                    <Text fontSize="sm" fontWeight="semibold">
                      {option.label}
                    </Text>
                    <Text fontSize="xs" color="fg.muted" whiteSpace="normal" lineHeight="tall">
                      {option.description}
                    </Text>
                  </Stack>
                </Button>
              );
            })}
          </Stack>

          {submissionPattern.kind === "time" && (
            <Stack direction={{ base: "column", lg: "row" }} gap={3}>
              <Field.Root invalid={!!errors.submissionPattern}>
                <Select
                  label="シフト開始時間"
                  items={timeStartOptions}
                  value={submissionPattern.startTime}
                  onChange={(value) =>
                    setSubmissionPattern({ ...submissionPattern, startTime: value || DEFAULT_TIME_PATTERN.startTime })
                  }
                  placeholder="選択してください"
                  usePortal={false}
                />
              </Field.Root>
              <Field.Root invalid={!!errors.submissionPattern}>
                <Select
                  label="シフト終了時間"
                  items={timeEndOptions}
                  value={submissionPattern.endTime}
                  onChange={(value) =>
                    setSubmissionPattern({ ...submissionPattern, endTime: value || DEFAULT_TIME_PATTERN.endTime })
                  }
                  placeholder="選択してください"
                  usePortal={false}
                />
              </Field.Root>
            </Stack>
          )}

          {submissionPattern.kind === "shiftType" && (
            <Stack gap={3} p={3} borderWidth={1} borderColor="border.default" borderRadius="md" bg="gray.50">
              {shiftTypeOptions.length === 0 ? (
                <Text fontSize="xs" color="fg.muted">
                  勤務区分を追加してください。
                </Text>
              ) : (
                <Stack gap={3}>
                  {shiftTypeOptions.map((option, index) => {
                    const optionEndOptions = ALL_END_OPTIONS.filter(
                      (item) => timeToMinutes(item.value) > timeToMinutes(option.startTime),
                    );
                    const optionStartOptions = ALL_START_OPTIONS.filter(
                      (item) => timeToMinutes(item.value) < timeToMinutes(option.endTime),
                    );
                    return (
                      <SimpleGrid key={option.id} columns={{ base: 1, md: 4 }} gap={2} alignItems="end">
                        <Field.Root>
                          <Field.Label>区分名</Field.Label>
                          <Input
                            value={option.name}
                            placeholder="例: 早番"
                            bg="white"
                            onChange={(event) => updateShiftTypeOption(index, { name: event.target.value })}
                          />
                        </Field.Root>
                        <Select
                          label="開始"
                          items={optionStartOptions}
                          value={option.startTime}
                          onChange={(value) => updateShiftTypeOption(index, { startTime: value })}
                          placeholder="開始"
                          usePortal={false}
                        />
                        <Select
                          label="終了"
                          items={optionEndOptions}
                          value={option.endTime}
                          onChange={(value) => updateShiftTypeOption(index, { endTime: value })}
                          placeholder="終了"
                          usePortal={false}
                        />
                        <HStack justify={{ base: "flex-end", md: "center" }}>
                          <IconButton
                            type="button"
                            aria-label={`${option.name || "勤務区分"}を削除`}
                            variant="outline"
                            colorPalette="gray"
                            bg="white"
                            onClick={() => removeShiftTypeOption(index)}
                          >
                            <LuTrash2 />
                          </IconButton>
                        </HStack>
                      </SimpleGrid>
                    );
                  })}
                </Stack>
              )}
              <Button type="button" variant="outline" bg="white" alignSelf="flex-start" onClick={addShiftTypeOption}>
                <LuPlus />
                勤務区分を追加
              </Button>
            </Stack>
          )}
          {errors.submissionPattern && (
            <Text fontSize="xs" color="red.600">
              勤務区分の入力内容を確認してください。
            </Text>
          )}
        </Stack>
        <Stack gap={3}>
          <Box>
            <Text fontSize="sm" fontWeight="medium" color="fg.default">
              定休日
            </Text>
            <Text mt={1} fontSize="xs" color="fg.muted" lineHeight="tall">
              決まった休みがある場合、選択してください。また、募集ごとに細かく調整することも可能です。
            </Text>
          </Box>
          <Flex gap={2} justify="space-between" align="center">
            {WEEKDAYS.map((day) => {
              const isClosed = regularClosedDays.includes(day.value);
              return (
                <Button
                  key={day.value}
                  type="button"
                  aria-label={`${day.ariaLabel}を${isClosed ? "定休日から外す" : "定休日にする"}`}
                  aria-pressed={isClosed}
                  w="44px"
                  h="44px"
                  minW="44px"
                  p={0}
                  borderRadius="full"
                  borderWidth={1}
                  borderColor={isClosed ? "gray.300" : "teal.600"}
                  bg={isClosed ? "gray.100" : "teal.600"}
                  color={isClosed ? "fg.muted" : "white"}
                  fontWeight="semibold"
                  onClick={() => toggleRegularClosedDay(day.value)}
                  _hover={{ bg: isClosed ? "gray.200" : "teal.700" }}
                >
                  {day.label}
                </Button>
              );
            })}
          </Flex>
          <Text fontSize="xs" color="fg.muted">
            {selectedClosedDayLabels.length > 0
              ? `定休日: ${selectedClosedDayLabels.join("・")}`
              : "定休日は未設定です"}
          </Text>
        </Stack>
      </Stack>
    </form>
  );
};
