import { Box, Field, Grid, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuCalendarDays, LuClock3, LuListChecks, LuPlus, LuTrash2 } from "react-icons/lu";
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
  timeToMinutes,
} from "./index";

type SetupShopInfoStepProps = {
  shopName: string;
  submissionPattern: ShiftSubmissionPattern;
  shopNameError?: string;
  onShopNameChange: (value: string) => void;
  onSubmissionPatternChange: (next: ShiftSubmissionPattern) => void;
};

type SetupPatternSettingsStepProps = {
  submissionPattern: ShiftSubmissionPattern;
  submissionPatternError?: unknown;
  onSubmissionPatternChange: (next: ShiftSubmissionPattern) => void;
};

const ALL_START_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES - 30 });
const ALL_END_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES });

export const DEFAULT_TIME_PATTERN: Extract<ShiftSubmissionPattern, { kind: "time" }> = {
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

const toSubmissionPattern = (
  kind: ShiftSubmissionPattern["kind"],
  current: ShiftSubmissionPattern,
): ShiftSubmissionPattern => {
  if (kind === "time") {
    return current.kind === "time" ? current : DEFAULT_TIME_PATTERN;
  }
  if (kind === "shiftType") {
    return {
      kind: "shiftType",
      options:
        current.kind === "shiftType" && current.options.length > 0 ? current.options : createDefaultShiftTypeOptions(),
    };
  }
  return { kind: "dateOnly" };
};

export const SetupShopInfoStep = ({
  shopName,
  submissionPattern,
  shopNameError,
  onShopNameChange,
  onSubmissionPatternChange,
}: SetupShopInfoStepProps) => (
  <Stack gap={5}>
    <Field.Root invalid={!!shopNameError}>
      <Field.Label>お店の名前</Field.Label>
      <Input
        name="shopName"
        value={shopName}
        placeholder="例：居酒屋たなか"
        onChange={(event) => onShopNameChange(event.target.value)}
      />
      {shopNameError && <Field.ErrorText>{shopNameError}</Field.ErrorText>}
    </Field.Root>

    <Stack gap={3}>
      <Box>
        <Text fontSize="sm" fontWeight="medium" color="fg.default">
          希望シフトの提出方法
        </Text>
      </Box>
      <SimpleGrid columns={3} gap={{ base: 2, md: 3 }}>
        {SUBMISSION_PATTERN_OPTIONS.map((option) => {
          const isSelected = submissionPattern.kind === option.kind;
          return (
            <Button
              key={option.kind}
              type="button"
              h="100%"
              minH={{ base: "128px", md: "160px" }}
              variant="outline"
              borderColor={isSelected ? "teal.500" : "border.default"}
              borderWidth={isSelected ? 2 : 1}
              bg={isSelected ? "teal.50" : "white"}
              color="fg.default"
              p={0}
              overflow="hidden"
              aria-pressed={isSelected}
              onClick={() => onSubmissionPatternChange(toSubmissionPattern(option.kind, submissionPattern))}
              _hover={{ bg: isSelected ? "teal.50" : "gray.50" }}
            >
              <Stack gap={0} align="stretch" w="full" h="full" textAlign="left">
                <Stack
                  direction={{ base: "column", md: "row" }}
                  gap={{ base: 1, md: 2 }}
                  minH={{ base: "56px", md: "72px" }}
                  align="center"
                  justify="center"
                  px={{ base: 2, md: 3 }}
                  bg={isSelected ? "teal.100" : "gray.50"}
                  borderBottomWidth={1}
                  borderColor={isSelected ? "teal.200" : "border.default"}
                  color={isSelected ? "teal.700" : "fg.muted"}
                  fontWeight="bold"
                >
                  {option.kind === "dateOnly" && <LuCalendarDays />}
                  {option.kind === "time" && <LuClock3 />}
                  {option.kind === "shiftType" && <LuListChecks />}
                  <Text fontSize={{ base: "xs", md: "sm" }} lineHeight="short" textAlign="center">
                    {option.label}
                  </Text>
                </Stack>
                <Stack gap={2} p={{ base: 2, md: 4 }} flex={1}>
                  <Text
                    fontSize="xs"
                    color="fg.muted"
                    whiteSpace="normal"
                    lineHeight={{ base: "short", md: "tall" }}
                    textAlign="left"
                  >
                    {option.description}
                  </Text>
                </Stack>
              </Stack>
            </Button>
          );
        })}
      </SimpleGrid>
    </Stack>
  </Stack>
);

export const SetupPatternSettingsStep = ({
  submissionPattern,
  submissionPatternError,
  onSubmissionPatternChange,
}: SetupPatternSettingsStepProps) => {
  const timeStart = submissionPattern.kind === "time" ? submissionPattern.startTime : DEFAULT_TIME_PATTERN.startTime;
  const timeEnd = submissionPattern.kind === "time" ? submissionPattern.endTime : DEFAULT_TIME_PATTERN.endTime;
  const shiftTypeOptions = submissionPattern.kind === "shiftType" ? submissionPattern.options : [];
  const shiftTypeOptionsError = getNestedErrorMessage(submissionPatternError, ["options"]);
  const hasSubmissionPatternError = !!submissionPatternError;
  const canAddShiftTypeOption = shiftTypeOptions.length < MAX_SHIFT_TYPE_OPTIONS;

  const timeEndOptions = useMemo(() => {
    const startMin = timeToMinutes(timeStart);
    return ALL_END_OPTIONS.filter((opt) => timeToMinutes(opt.value) > startMin);
  }, [timeStart]);

  const timeStartOptions = useMemo(() => {
    const endMin = timeToMinutes(timeEnd);
    return ALL_START_OPTIONS.filter((opt) => timeToMinutes(opt.value) < endMin);
  }, [timeEnd]);

  const updateShiftTypeOption = (index: number, patch: Partial<ShiftTypeOption>) => {
    if (submissionPattern.kind !== "shiftType") return;
    onSubmissionPatternChange({
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
    onSubmissionPatternChange({
      kind: "shiftType",
      options: normalizeShiftTypeOptions([
        ...submissionPattern.options,
        createShiftTypeOption(submissionPattern.options.length),
      ]),
    });
  };

  const removeShiftTypeOption = (index: number) => {
    if (submissionPattern.kind !== "shiftType") return;
    onSubmissionPatternChange({
      kind: "shiftType",
      options: normalizeShiftTypeOptions(submissionPattern.options.filter((_, optionIndex) => optionIndex !== index)),
    });
  };

  if (submissionPattern.kind === "time") {
    return (
      <Stack direction={{ base: "column", lg: "row" }} gap={3}>
        <Field.Root invalid={!!submissionPatternError}>
          <Select
            label="シフト開始時間"
            items={timeStartOptions}
            value={submissionPattern.startTime}
            onChange={(value) =>
              onSubmissionPatternChange({ ...submissionPattern, startTime: value || DEFAULT_TIME_PATTERN.startTime })
            }
            placeholder="選択してください"
            usePortal={false}
            positioning={DIALOG_SELECT_POSITIONING}
          />
        </Field.Root>
        <Field.Root invalid={!!submissionPatternError}>
          <Select
            label="シフト終了時間"
            items={timeEndOptions}
            value={submissionPattern.endTime}
            onChange={(value) =>
              onSubmissionPatternChange({ ...submissionPattern, endTime: value || DEFAULT_TIME_PATTERN.endTime })
            }
            placeholder="選択してください"
            usePortal={false}
            positioning={DIALOG_SELECT_POSITIONING}
          />
        </Field.Root>
      </Stack>
    );
  }

  if (submissionPattern.kind !== "shiftType") return null;

  return (
    <Stack
      gap={3}
      p={3}
      borderWidth={1}
      borderColor={hasSubmissionPatternError ? "red.200" : "border.default"}
      borderRadius="md"
      bg="gray.50"
    >
      <Stack gap={3}>
        {shiftTypeOptions.length === 0 ? (
          <Text fontSize="xs" color={shiftTypeOptionsError ? "red.600" : "fg.muted"}>
            {shiftTypeOptionsError ?? "勤務区分を追加してください。"}
          </Text>
        ) : (
          shiftTypeOptions.map((option, index) => {
            const optionEndOptions = ALL_END_OPTIONS.filter(
              (item) => timeToMinutes(item.value) > timeToMinutes(option.startTime),
            );
            const optionStartOptions = ALL_START_OPTIONS.filter(
              (item) => timeToMinutes(item.value) < timeToMinutes(option.endTime),
            );
            const nameError = getNestedErrorMessage(submissionPatternError, ["options", index, "name"]);
            const startTimeError = getNestedErrorMessage(submissionPatternError, ["options", index, "startTime"]);
            const endTimeError = getNestedErrorMessage(submissionPatternError, ["options", index, "endTime"]);
            const optionErrorMessages = getShiftTypeOptionErrorMessages(submissionPatternError, index);
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
                {index < shiftTypeOptions.length - 1 && (
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
  );
};
