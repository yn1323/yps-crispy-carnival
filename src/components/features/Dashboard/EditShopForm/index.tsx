import { Box, Field, Flex, Grid, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  LuCalendarDays,
  LuChevronLeft,
  LuClock3,
  LuListChecks,
  LuPlus,
  LuSettings2,
  LuStore,
  LuTrash2,
} from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/Select";
import { StepperDialogContent, type StepperDialogStep } from "@/src/components/ui/StepperDialog";
import {
  createDefaultShiftTypeOptions,
  createShiftTypeOption,
  DIALOG_SELECT_POSITIONING,
  getNestedErrorMessage,
  getShiftTypeOptionErrorMessages,
  normalizeShiftTypeOptions,
} from "../submissionPatternForm";
import {
  type EditShopFormData,
  editShopSchema,
  generateShiftTimeOptions,
  MAX_SHIFT_TIME_MINUTES,
  MAX_SHIFT_TYPE_OPTIONS,
  type RegularClosedDay,
  type ShiftSubmissionPattern,
  type ShiftTypeOption,
  timeToMinutes,
} from "./index";

type Step = "shopName" | "submissionPattern" | "patternSettings" | "regularClosedDays";

type Props = {
  defaultValues: EditShopFormData;
  onSubmit: (data: EditShopFormData) => void | Promise<void>;
  onCancel?: () => void;
  initialStep?: Step;
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

const ALL_START_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES - 30 });
const ALL_END_OPTIONS = generateShiftTimeOptions({ endMinutes: MAX_SHIFT_TIME_MINUTES });

const SUBMISSION_PATTERN_OPTIONS: Array<{
  kind: ShiftSubmissionPattern["kind"];
  label: string;
  description: string;
}> = [
  { kind: "dateOnly", label: "日付のみ", description: "出勤可能な日付だけを収集します。" },
  { kind: "time", label: "時間を自由に設定", description: "スタッフが日ごとに働ける時間を自由に入力します。" },
  {
    kind: "shiftType",
    label: "勤務区分から選ぶ",
    description: "早番・遅番など、あらかじめ決めた時間帯から選んでもらいます。",
  },
];

const steps: StepperDialogStep<Step>[] = [
  {
    value: "shopName",
    label: "店舗名",
    icon: LuStore,
    title: "店舗名",
    description: "管理画面やスタッフへの案内に表示するお店の名前です。",
  },
  {
    value: "submissionPattern",
    label: "集め方",
    icon: LuListChecks,
    title: "希望シフトの集め方",
    description: "スタッフのシフトを提出方法を設定します。",
  },
  {
    value: "patternSettings",
    label: "勤務時間",
    icon: LuSettings2,
    title: "勤務時間",
    description: "スタッフが選択可能な時間帯を設定します。",
  },
  {
    value: "regularClosedDays",
    label: "定休日",
    icon: LuCalendarDays,
    title: "定休日",
    description: "お休みの曜日を押してください。また、募集ごとに細かく調整することも可能です。",
  },
];

const DEFAULT_TIME_PATTERN: Extract<ShiftSubmissionPattern, { kind: "time" }> = {
  kind: "time",
  startTime: "09:00",
  endTime: "22:00",
};

const getNextStep = (step: Step): Step => {
  if (step === "shopName") return "submissionPattern";
  if (step === "submissionPattern") return "patternSettings";
  if (step === "patternSettings") return "regularClosedDays";
  return "regularClosedDays";
};

const getPreviousStep = (step: Step): Step => {
  if (step === "regularClosedDays") return "patternSettings";
  if (step === "patternSettings") return "submissionPattern";
  if (step === "submissionPattern") return "shopName";
  return "shopName";
};

export const EditShopForm = ({ defaultValues, onSubmit, onCancel, initialStep = "shopName" }: Props) => {
  const [currentStep, setCurrentStep] = useState<Step>(initialStep);
  const [regularClosedDays, setRegularClosedDays] = useState<RegularClosedDay[]>(defaultValues.regularClosedDays);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
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
  const shiftTypeOptionsError = getNestedErrorMessage(errors.submissionPattern, ["options"]);
  const hasSubmissionPatternError = !!errors.submissionPattern;
  const canAddShiftTypeOption = shiftTypeOptions.length < MAX_SHIFT_TYPE_OPTIONS;

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
            : createDefaultShiftTypeOptions(),
      });
      return;
    }
    setSubmissionPattern({ kind: "dateOnly" });
  };

  const goToNextStep = () => {
    setCurrentStep((step) => getNextStep(step));
  };

  const goToPreviousStep = () => {
    setCurrentStep((step) => getPreviousStep(step));
  };

  const handlePatternSettingsNext = async () => {
    const isValid = await trigger("submissionPattern", { shouldFocus: true });
    if (!isValid) return;
    goToNextStep();
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

  const submitForm = handleSubmit(
    async (data) => {
      await onSubmit({
        ...data,
        regularClosedDays: sortRegularClosedDays(regularClosedDays),
        submissionPattern:
          data.submissionPattern.kind === "shiftType"
            ? { kind: "shiftType", options: normalizeShiftTypeOptions(data.submissionPattern.options) }
            : data.submissionPattern,
      });
    },
    (invalidErrors) => {
      if (invalidErrors.shopName) {
        setCurrentStep("shopName");
        return;
      }
      if (invalidErrors.submissionPattern) {
        setCurrentStep("patternSettings");
        return;
      }
      setCurrentStep("regularClosedDays");
    },
  );

  const actions =
    currentStep === "shopName" ? (
      <>
        <Button type="button" variant="outline" onClick={onCancel} flex={{ base: 1, md: "unset" }}>
          キャンセル
        </Button>
        <Button type="button" colorPalette="teal" onClick={goToNextStep} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    ) : currentStep === "patternSettings" ? (
      <>
        <Button type="button" variant="outline" onClick={goToPreviousStep} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={handlePatternSettingsNext} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    ) : currentStep === "regularClosedDays" ? (
      <>
        <Button type="button" variant="outline" onClick={goToPreviousStep} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button
          type="button"
          colorPalette="teal"
          loading={isSubmitting}
          onClick={submitForm}
          flex={{ base: 1, md: "unset" }}
        >
          変更を保存
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="outline" onClick={goToPreviousStep} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={goToNextStep} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    );

  return (
    <form
      id="edit-shop-form"
      noValidate
      style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <StepperDialogContent steps={steps} currentStep={currentStep} actions={actions}>
        {currentStep === "shopName" && (
          <Field.Root invalid={!!errors.shopName}>
            <Field.Label>お店の名前</Field.Label>
            <Input placeholder="例：居酒屋たなか" {...register("shopName")} />
            {errors.shopName && <Field.ErrorText>{errors.shopName.message}</Field.ErrorText>}
          </Field.Root>
        )}

        {currentStep === "submissionPattern" && (
          <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
            {SUBMISSION_PATTERN_OPTIONS.map((option) => {
              const isSelected = submissionPattern.kind === option.kind;
              return (
                <Button
                  key={option.kind}
                  type="button"
                  h="100%"
                  minH="212px"
                  variant="outline"
                  borderColor={isSelected ? "teal.500" : "border.default"}
                  borderWidth={isSelected ? 2 : 1}
                  bg={isSelected ? "teal.50" : "white"}
                  color="fg.default"
                  p={0}
                  overflow="hidden"
                  aria-pressed={isSelected}
                  onClick={() => handleSubmissionPatternChange(option.kind)}
                  _hover={{ bg: isSelected ? "teal.50" : "gray.50" }}
                >
                  <Stack gap={0} align="stretch" w="full" h="full" textAlign="left">
                    <Flex
                      h="96px"
                      align="center"
                      justify="center"
                      bg={isSelected ? "teal.100" : "gray.50"}
                      borderBottomWidth={1}
                      borderColor={isSelected ? "teal.200" : "border.default"}
                    >
                      <HStack gap={2} color={isSelected ? "teal.700" : "fg.muted"} fontWeight="bold">
                        {option.kind === "time" && <LuClock3 />}
                        {option.kind === "dateOnly" && <LuCalendarDays />}
                        {option.kind === "shiftType" && <LuListChecks />}
                        <Text fontSize="sm">{option.label}</Text>
                      </HStack>
                    </Flex>
                    <Stack gap={2} p={4} flex={1}>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.900">
                        {option.label}
                      </Text>
                      <Text fontSize="xs" color="fg.muted" whiteSpace="normal" lineHeight="tall">
                        {option.description}
                      </Text>
                    </Stack>
                  </Stack>
                </Button>
              );
            })}
          </SimpleGrid>
        )}

        {currentStep === "patternSettings" && (
          <Stack gap={3}>
            {submissionPattern.kind === "dateOnly" && (
              <Box borderWidth={1} borderColor="border.default" borderRadius="md" bg="gray.50" p={4}>
                <Text fontSize="sm" fontWeight="semibold" color="gray.900">
                  追加設定なし
                </Text>
                <Text mt={1} fontSize="xs" color="fg.muted" lineHeight="tall">
                  スタッフに出勤できる日のみ選んでもらいます。
                </Text>
              </Box>
            )}

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
                {shiftTypeOptions.length === 0 ? (
                  <Text fontSize="xs" color={shiftTypeOptionsError ? "red.600" : "fg.muted"}>
                    {shiftTypeOptionsError ?? "勤務区分を追加してください。"}
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
                      const nameError = getNestedErrorMessage(errors.submissionPattern, ["options", index, "name"]);
                      const startTimeError = getNestedErrorMessage(errors.submissionPattern, [
                        "options",
                        index,
                        "startTime",
                      ]);
                      const endTimeError = getNestedErrorMessage(errors.submissionPattern, [
                        "options",
                        index,
                        "endTime",
                      ]);
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
                          {index < shiftTypeOptions.length - 1 && (
                            <Box aria-hidden="true" h="1px" bg="gray.300" mx={{ base: 2, md: 4 }} />
                          )}
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
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
        )}

        {currentStep === "regularClosedDays" && (
          <Stack gap={3}>
            <Flex
              gap={{ base: 1, md: 3 }}
              direction={{ base: "column", md: "row" }}
              justify="space-between"
              align={{ base: "flex-start", md: "center" }}
            >
              <Text fontSize="sm" fontWeight="semibold" color="gray.900">
                毎週休みにする曜日
              </Text>
              <Text fontSize="xs" color="fg.muted">
                現在の設定:{" "}
                {selectedClosedDayLabels.length > 0 ? `毎週 ${selectedClosedDayLabels.join("・")}` : "定休日なし"}
              </Text>
            </Flex>
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
          </Stack>
        )}
      </StepperDialogContent>
    </form>
  );
};
