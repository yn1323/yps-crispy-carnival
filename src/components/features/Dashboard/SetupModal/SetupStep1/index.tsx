import { Box, Field, Grid, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/Select";
import {
  createDefaultShiftTypeOptions,
  createShiftTypeOption,
  DIALOG_SELECT_POSITIONING,
  getNestedErrorMessage,
  getShiftTypeOptionErrorMessages,
  normalizeShiftTypeOptions,
} from "../../submissionPatternForm";
import {
  generateShiftTimeOptions,
  MAX_SHIFT_TIME_MINUTES,
  MAX_SHIFT_TYPE_OPTIONS,
  type ShiftSubmissionPattern,
  type ShiftTypeOption,
  type Step1Data,
  step1Schema,
  timeToMinutes,
} from "./index";

type Props = {
  defaultValues?: Step1Data;
  onNext: (data: Step1Data) => void;
};

const ALL_START_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES - 30 });
const ALL_END_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES });
const DEFAULT_TIME_PATTERN: Extract<ShiftSubmissionPattern, { kind: "time" }> = {
  kind: "time",
  startTime: "09:00",
  endTime: "22:00",
};

const SUBMISSION_PATTERN_OPTIONS: Array<{
  kind: ShiftSubmissionPattern["kind"];
  label: string;
  description: string;
}> = [
  { kind: "dateOnly", label: "日ごと", description: "出勤できる日だけ集めます。" },
  { kind: "time", label: "時間指定", description: "日ごとに開始・終了時間を選んでもらいます。" },
  { kind: "shiftType", label: "勤務区分", description: "早番・遅番など、決めた区分から選んでもらいます。" },
];

export const SetupStep1 = ({ defaultValues, onNext }: Props) => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: defaultValues ?? { shopName: "", submissionPattern: { kind: "dateOnly" } },
  });

  const submissionPattern = watch("submissionPattern");
  const timeStart = submissionPattern.kind === "time" ? submissionPattern.startTime : DEFAULT_TIME_PATTERN.startTime;
  const timeEnd = submissionPattern.kind === "time" ? submissionPattern.endTime : DEFAULT_TIME_PATTERN.endTime;
  const shiftTypeOptionsError = getNestedErrorMessage(errors.submissionPattern, ["options"]);
  const hasSubmissionPatternError = !!errors.submissionPattern;
  const shiftTypeOptions = submissionPattern.kind === "shiftType" ? submissionPattern.options : [];
  const canAddShiftTypeOption = shiftTypeOptions.length < MAX_SHIFT_TYPE_OPTIONS;

  const timeEndOptions = useMemo(() => {
    const startMin = timeToMinutes(timeStart);
    return ALL_END_OPTIONS.filter((opt) => timeToMinutes(opt.value) > startMin);
  }, [timeStart]);

  const timeStartOptions = useMemo(() => {
    const endMin = timeToMinutes(timeEnd);
    return ALL_START_OPTIONS.filter((opt) => timeToMinutes(opt.value) < endMin);
  }, [timeEnd]);

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
        kind: "shiftType",
        options:
          submissionPattern.kind === "shiftType" && submissionPattern.options.length > 0
            ? submissionPattern.options
            : createDefaultShiftTypeOptions(),
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
    if (submissionPattern.kind !== "shiftType" || submissionPattern.options.length >= MAX_SHIFT_TYPE_OPTIONS) return;
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
      id="setup-step1"
      onSubmit={handleSubmit((data) =>
        onNext({
          ...data,
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
                  positioning={DIALOG_SELECT_POSITIONING}
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
                  positioning={DIALOG_SELECT_POSITIONING}
                />
              </Field.Root>
            </Stack>
          )}

          {submissionPattern.kind === "shiftType" && (
            <Stack
              gap={3}
              p={3}
              borderWidth={1}
              borderColor={hasSubmissionPatternError ? "red.200" : "border.default"}
              borderRadius="md"
              bg="gray.50"
            >
              <Stack gap={3}>
                {submissionPattern.options.length === 0 ? (
                  <Text fontSize="xs" color={shiftTypeOptionsError ? "red.600" : "fg.muted"}>
                    {shiftTypeOptionsError ?? "勤務区分を追加してください。"}
                  </Text>
                ) : (
                  submissionPattern.options.map((option, index) => {
                    const optionEndOptions = ALL_END_OPTIONS.filter(
                      (item) => timeToMinutes(item.value) > timeToMinutes(option.startTime),
                    );
                    const optionStartOptions = ALL_START_OPTIONS.filter(
                      (item) => timeToMinutes(item.value) < timeToMinutes(option.endTime),
                    );
                    const nameError = getNestedErrorMessage(errors.submissionPattern, ["options", index, "name"]);
                    const startTimeError = getNestedErrorMessage(errors.submissionPattern, [
                      "options",
                      index,
                      "startTime",
                    ]);
                    const endTimeError = getNestedErrorMessage(errors.submissionPattern, ["options", index, "endTime"]);
                    const optionErrorMessages = getShiftTypeOptionErrorMessages(errors.submissionPattern, index);
                    return (
                      <Stack key={option.id} gap={3}>
                        <Grid
                          templateColumns={{
                            base: "minmax(0, 1fr) minmax(0, 1fr) auto",
                            md: "minmax(180px, 1fr) minmax(148px, 180px) minmax(148px, 180px) auto",
                          }}
                          gap={2}
                          alignItems="end"
                        >
                          <Field.Root invalid={!!nameError} gridColumn={{ base: "1 / -1", md: "auto" }}>
                            <Field.Label>区分名</Field.Label>
                            <Input
                              value={option.name}
                              placeholder="例: 早番"
                              bg="white"
                              onChange={(event) => updateShiftTypeOption(index, { name: event.target.value })}
                            />
                          </Field.Root>
                          <Field.Root invalid={!!startTimeError}>
                            <Select
                              label="開始"
                              items={optionStartOptions}
                              value={option.startTime}
                              onChange={(value) => updateShiftTypeOption(index, { startTime: value })}
                              placeholder="開始"
                              usePortal={false}
                              positioning={DIALOG_SELECT_POSITIONING}
                            />
                          </Field.Root>
                          <Field.Root invalid={!!endTimeError}>
                            <Select
                              label="終了"
                              items={optionEndOptions}
                              value={option.endTime}
                              onChange={(value) => updateShiftTypeOption(index, { endTime: value })}
                              placeholder="終了"
                              usePortal={false}
                              positioning={DIALOG_SELECT_POSITIONING}
                            />
                          </Field.Root>
                          <HStack justify={{ base: "flex-end", md: "start" }} alignSelf="end">
                            <IconButton
                              type="button"
                              aria-label={`${option.name || "勤務区分"}を削除`}
                              variant="outline"
                              colorPalette="red"
                              bg="white"
                              color="red.600"
                              onClick={() => removeShiftTypeOption(index)}
                            >
                              <LuTrash2 />
                            </IconButton>
                          </HStack>
                          {optionErrorMessages.length > 0 && (
                            <Stack gap={1} gridColumn="1 / -1">
                              {optionErrorMessages.map((message) => (
                                <Text key={message} fontSize="xs" color="red.600" lineHeight="short">
                                  {message}
                                </Text>
                              ))}
                            </Stack>
                          )}
                        </Grid>
                        {index < submissionPattern.options.length - 1 && (
                          <Box aria-hidden="true" h="1px" bg="gray.300" mx={{ base: 2, md: 4 }} />
                        )}
                      </Stack>
                    );
                  })
                )}
              </Stack>
              <Stack gap={1} align="flex-start">
                <Button
                  type="button"
                  variant="outline"
                  bg="white"
                  alignSelf="flex-start"
                  disabled={!canAddShiftTypeOption}
                  onClick={addShiftTypeOption}
                >
                  <LuPlus />
                  勤務区分を追加
                </Button>
                {!canAddShiftTypeOption && (
                  <Text fontSize="xs" color="fg.muted">
                    勤務区分は{MAX_SHIFT_TYPE_OPTIONS}件まで登録できます。
                  </Text>
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Stack>
    </form>
  );
};
