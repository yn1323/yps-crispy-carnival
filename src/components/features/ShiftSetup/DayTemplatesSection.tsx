import { Box, chakra, Field, Flex, Grid, HStack, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useId } from "react";
import { LuMinus, LuPlus, LuSparkles, LuTrash2, LuUsers } from "react-icons/lu";
import {
  SHIFT_DAY_TEMPLATE_LIMIT,
  SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
  SHIFT_DAY_TEMPLATE_SLOT_LIMIT,
} from "@/convex/constants";
import type { ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { Input, NativeSelect } from "@/src/components/ui/FormControls";
import {
  canAddTimeSlot,
  getDayTemplateSlotLabel,
  getTimeSlotEndOptions,
  getTimeSlotStartOptions,
  getUnassignedWeekdays,
} from "./dayTemplateDrafts";
import { PositionDot, SetupSection } from "./parts";
import { WEEKDAY_OPTIONS } from "./script";
import type {
  DayTemplateDraft,
  DayTemplateSlotDraft,
  ShiftSetupData,
  ShiftSetupEditorView,
  ShiftSetupIntents,
  ShiftSetupPosition,
  ShiftSetupSubmissionPattern,
} from "./types";

const SLOT_COLUMN_LABELS: Record<ShiftSetupSubmissionPattern["kind"], string> = {
  time: "時間帯",
  shiftType: "勤務パターン",
  dateOnly: "区切り",
};

const SECTION_DESCRIPTIONS: Record<ShiftSetupSubmissionPattern["kind"], string> = {
  time: "曜日のまとまりごとに「型」を作り、時間帯とポジション別に必要な人数を決めます。",
  shiftType: "曜日のまとまりごとに「型」を作り、勤務パターンとポジション別に必要な人数を決めます。",
  dateOnly: "曜日のまとまりごとに「型」を作り、1日に必要な人数をポジション別に決めます。",
};

/** スマートフォンで押しやすい高さを確保する、ページ上の主なボタンの高さ。 */
const MOBILE_TAP_HEIGHT = { base: "44px", md: "40px" };

/** PCで表を横にスクロールしても、区切りの列を左端に残す。 */
const STICKY_SLOT_COLUMN = {
  position: { md: "sticky" },
  left: { md: 0 },
  zIndex: { md: 1 },
  bg: { md: "white" },
  // 左端のSelectのフォーカスの枠が、スクロール領域の端で切れないようにする。
  ps: { md: 1 },
} as const;

type Props = {
  setup: ShiftSetupData;
  canWrite: boolean;
  dayTemplates: ShiftSetupEditorView["dayTemplates"];
  intents: ShiftSetupIntents;
  onOpenAssist: () => void;
};

export function DayTemplatesSection({ setup, canWrite, dayTemplates, intents, onOpenAssist }: Props) {
  const { drafts, issueMessages, canAdd } = dayTemplates;
  const pattern = setup.submissionPattern;
  const canUseAssist = setup.assistAvailable && canWrite;
  const closedDays = new Set(setup.regularClosedDays);
  const unassignedLabels = WEEKDAY_OPTIONS.filter(
    (day) => getUnassignedWeekdays(drafts).includes(day.value) && !closedDays.has(day.value),
  ).map((day) => day.label);

  const assistButton = (variant: "ghost" | "outline") => (
    <Button
      type="button"
      variant={variant}
      colorPalette={variant === "ghost" ? "teal" : undefined}
      bg={variant === "outline" ? "white" : undefined}
      size={variant === "ghost" ? "sm" : "md"}
      minH={variant === "outline" ? MOBILE_TAP_HEIGHT : undefined}
      gap={1.5}
      fontWeight="semibold"
      flexShrink={0}
      onClick={onOpenAssist}
    >
      <LuSparkles aria-hidden />
      AIで下書きを作る
    </Button>
  );

  return (
    <SetupSection
      headingId="shift-setup-day-templates-heading"
      title="必要人数"
      description={`${SECTION_DESCRIPTIONS[pattern.kind]}シフト表で人数の過不足を確かめられます。`}
      action={drafts.length > 0 && canUseAssist ? assistButton("ghost") : undefined}
    >
      {drafts.length === 0 ? (
        <Empty
          icon={LuUsers}
          title="必要人数はまだ設定していません"
          titleAs="h3"
          description={
            canWrite ? "最初の型には営業日のすべての曜日が入ります。\n人数はあとから＋と−で決められます。" : undefined
          }
          variant="section"
          py={8}
          action={
            canWrite ? (
              <Flex gap={2} wrap="wrap" justify="center">
                <Button type="button" colorPalette="teal" minH={MOBILE_TAP_HEIGHT} onClick={intents.onAddDayTemplate}>
                  <LuPlus aria-hidden />
                  型を作る
                </Button>
                {canUseAssist && assistButton("outline")}
              </Flex>
            ) : undefined
          }
        />
      ) : (
        <Stack gap={{ base: 3, md: 4 }}>
          {drafts.map((draft) => (
            <DayTemplateCard
              key={draft.rowKey}
              draft={draft}
              drafts={drafts}
              positions={setup.positions}
              pattern={pattern}
              closedDays={closedDays}
              canWrite={canWrite}
              issueMessage={issueMessages[draft.rowKey]}
              intents={intents}
            />
          ))}

          {unassignedLabels.length > 0 && (
            <Text fontSize="sm" color="fg.muted">
              {unassignedLabels.join("・")}曜日はまだどの型にも入っていません
            </Text>
          )}

          <Stack gap={1} align="flex-start">
            <Button
              type="button"
              variant="outline"
              bg="white"
              minH={MOBILE_TAP_HEIGHT}
              disabled={!canWrite || !canAdd}
              onClick={intents.onAddDayTemplate}
            >
              <LuPlus aria-hidden />
              型を追加
            </Button>
            {!canAdd && (
              <Text fontSize="xs" color="fg.muted">
                型は{SHIFT_DAY_TEMPLATE_LIMIT}件まで作れます
              </Text>
            )}
          </Stack>
        </Stack>
      )}
    </SetupSection>
  );
}

type CardProps = {
  draft: DayTemplateDraft;
  drafts: readonly DayTemplateDraft[];
  positions: readonly ShiftSetupPosition[];
  pattern: ShiftSetupSubmissionPattern;
  closedDays: ReadonlySet<ShiftSetupWeekday>;
  canWrite: boolean;
  issueMessage?: string;
  intents: ShiftSetupIntents;
};

function DayTemplateCard({
  draft,
  drafts,
  positions,
  pattern,
  closedDays,
  canWrite,
  issueMessage,
  intents,
}: CardProps) {
  const weekdayLabelId = useId();
  const templateLabel = draft.name.trim() || "名前のない型";
  const hasOtherTemplates = drafts.length > 1;
  const hasClosedDays = closedDays.size > 0;
  const isTimePattern = pattern.kind === "time";
  const weekdayNotes = [
    ...(hasOtherTemplates ? ["別の型が使っている曜日を押すと、この型へ移ります。"] : []),
    ...(hasClosedDays ? ["「休」は定休日です。"] : []),
    ...(draft.weekdays.length === 0 ? ["曜日を選ばない型は、シフト表で日付ごとに当てて使います。"] : []),
  ];

  return (
    <Box
      role="group"
      aria-label={templateLabel}
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
    >
      <Stack gap={{ base: 4, md: 5 }} px={{ base: 3, md: 5 }} py={{ base: 4, md: 5 }}>
        <Flex gap={3} align="flex-end" justify="space-between" wrap="wrap">
          <Field.Root flex="1 1 12rem" maxW="20rem" minW={0}>
            <Field.Label>型の名前</Field.Label>
            <Input
              value={draft.name}
              maxLength={SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH}
              placeholder="平日"
              bg="white"
              disabled={!canWrite}
              onChange={(event) => intents.onRenameDayTemplate(draft.rowKey, event.target.value)}
            />
          </Field.Root>
          <Button
            type="button"
            variant="ghost"
            colorPalette="red"
            color="red.600"
            size="sm"
            minH={{ base: "44px", md: "36px" }}
            gap={1.5}
            disabled={!canWrite}
            onClick={() => intents.onRemoveDayTemplate(draft.rowKey)}
          >
            <LuTrash2 aria-hidden />
            この型を削除
          </Button>
        </Flex>

        <Stack gap={2}>
          <Text id={weekdayLabelId} fontSize="sm" fontWeight="semibold" color="gray.900">
            この型を使う曜日
          </Text>
          <Grid
            role="group"
            aria-labelledby={weekdayLabelId}
            templateColumns="repeat(7, minmax(0, 1fr))"
            gap={{ base: 1, md: 1.5 }}
            maxW="26rem"
          >
            {WEEKDAY_OPTIONS.map((day) => {
              const isSelected = draft.weekdays.includes(day.value);
              const owner = isSelected ? undefined : drafts.find((candidate) => candidate.weekdays.includes(day.value));
              return (
                <WeekdayToggle
                  key={day.value}
                  label={day.label}
                  isSelected={isSelected}
                  isClosed={closedDays.has(day.value)}
                  ownerLabel={owner ? owner.name.trim() || "名前のない型" : undefined}
                  disabled={!canWrite}
                  onToggle={() => intents.onToggleWeekday(draft.rowKey, day.value)}
                />
              );
            })}
          </Grid>
          {weekdayNotes.length > 0 && (
            <Text fontSize="xs" color="fg.muted" lineHeight="tall">
              {weekdayNotes.join("")}
            </Text>
          )}
        </Stack>

        <RequiredCountTable
          draft={draft}
          templateLabel={templateLabel}
          positions={positions}
          pattern={pattern}
          canWrite={canWrite}
          intents={intents}
        />

        {isTimePattern && (
          <Stack gap={1} align="flex-start">
            <Button
              type="button"
              variant="outline"
              bg="white"
              size="sm"
              minH={{ base: "44px", md: "36px" }}
              disabled={!canWrite || !canAddTimeSlot(draft, pattern)}
              onClick={() => intents.onAddTimeSlot(draft.rowKey)}
            >
              <LuPlus aria-hidden />
              時間帯を追加
            </Button>
            {draft.slots.length >= SHIFT_DAY_TEMPLATE_SLOT_LIMIT && (
              <Text fontSize="xs" color="fg.muted">
                時間帯は{SHIFT_DAY_TEMPLATE_SLOT_LIMIT}件まで作れます
              </Text>
            )}
          </Stack>
        )}

        {issueMessage && (
          <Text role="alert" fontSize="sm" fontWeight="semibold" color="red.600">
            {issueMessage}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

type WeekdayToggleProps = {
  label: string;
  isSelected: boolean;
  isClosed: boolean;
  /** この曜日を持っている別の型の名前。 */
  ownerLabel?: string;
  disabled: boolean;
  onToggle: () => void;
};

function WeekdayToggle({ label, isSelected, isClosed, ownerLabel, disabled, onToggle }: WeekdayToggleProps) {
  const accessibleLabel = [
    `${label}曜日`,
    ...(isClosed ? ["定休日"] : []),
    ...(ownerLabel ? [`${ownerLabel}で使用中`] : []),
  ].join("・");

  return (
    <chakra.button
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={isSelected}
      disabled={disabled}
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={0}
      minH="44px"
      minW={0}
      borderWidth="1px"
      borderRadius="md"
      fontSize="sm"
      fontWeight="bold"
      lineHeight="1.2"
      cursor={disabled ? "not-allowed" : "pointer"}
      transitionProperty="background-color"
      transitionDuration="faster"
      _disabled={{ opacity: 0.64 }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "2px" }}
      {...(isSelected
        ? { bg: "teal.600", borderColor: "teal.600", color: "white", _active: { bg: "teal.700" } }
        : ownerLabel
          ? { bg: "gray.100", borderColor: "gray.200", color: "gray.500", _active: { bg: "gray.200" } }
          : { bg: "white", borderColor: "gray.300", color: "gray.800", _active: { bg: "gray.100" } })}
      onClick={onToggle}
    >
      <span aria-hidden>{label}</span>
      {isClosed && (
        <chakra.span aria-hidden fontSize="2xs" fontWeight="normal">
          休
        </chakra.span>
      )}
    </chakra.button>
  );
}

type TableProps = {
  draft: DayTemplateDraft;
  templateLabel: string;
  positions: readonly ShiftSetupPosition[];
  pattern: ShiftSetupSubmissionPattern;
  canWrite: boolean;
  intents: ShiftSetupIntents;
};

/**
 * 区切り×ポジションの必要人数。
 * PCでは表として並べ、スマートフォンでは同じ要素を区切りごとのカードへ組み替える。
 */
function RequiredCountTable({ draft, templateLabel, positions, pattern, canWrite, intents }: TableProps) {
  const isTimePattern = pattern.kind === "time";
  const slotColumnWidth = isTimePattern ? 276 : 200;
  const positionColumnWidth = 128;
  const columns = `${slotColumnWidth}px repeat(${positions.length}, minmax(${positionColumnWidth}px, 1fr))`;

  if (draft.slots.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted">
        時間帯がありません。「時間帯を追加」から足せます。
      </Text>
    );
  }

  return (
    <Box overflowX={{ md: "auto" }}>
      <Stack
        role="table"
        aria-label={`${templateLabel}の必要人数`}
        gap={{ base: 2, md: 0 }}
        minW={{ md: `${slotColumnWidth + positions.length * positionColumnWidth}px` }}
        pe={{ md: 1 }}
      >
        <Grid
          role="row"
          display={{ base: "none", md: "grid" }}
          templateColumns={columns}
          alignItems="end"
          pb={2}
          borderBottomWidth="1px"
          borderColor="gray.200"
        >
          <Flex
            role="columnheader"
            align="flex-end"
            alignSelf="stretch"
            fontSize="xs"
            fontWeight="semibold"
            color="fg.muted"
            {...STICKY_SLOT_COLUMN}
          >
            {SLOT_COLUMN_LABELS[pattern.kind]}
          </Flex>
          {positions.map((position) => (
            <HStack key={position._id} role="columnheader" gap={1.5} justify="center" px={1} minW={0}>
              <PositionDot color={position.color} size="10px" />
              <Text fontSize="xs" fontWeight="semibold" color="gray.800" overflowWrap="anywhere" lineClamp={2}>
                {position.name}
              </Text>
            </HStack>
          ))}
        </Grid>

        {draft.slots.map((slot) => {
          const slotLabel = getDayTemplateSlotLabel(slot.key, pattern);
          return (
            <Grid
              key={slot.rowKey}
              role="row"
              templateColumns={{ base: "minmax(0, 1fr)", md: columns }}
              alignItems="center"
              rowGap={{ base: 1, md: 0 }}
              px={{ base: 3, md: 0 }}
              py={{ base: 3, md: 2 }}
              borderWidth={{ base: "1px", md: 0 }}
              borderBottomWidth={{ md: "1px" }}
              borderColor={{ base: "gray.200", md: "blackAlpha.100" }}
              borderRadius={{ base: "lg", md: 0 }}
              bg={{ base: "gray.50", md: "transparent" }}
            >
              <Box role="rowheader" minW={0} pe={{ md: 3 }} pb={{ base: 1, md: 0 }} {...STICKY_SLOT_COLUMN}>
                {slot.key.kind === "time" ? (
                  <TimeSlotHeader
                    draft={draft}
                    slot={slot}
                    startTime={slot.key.startTime}
                    endTime={slot.key.endTime}
                    label={slotLabel.title}
                    pattern={pattern}
                    canWrite={canWrite}
                    intents={intents}
                  />
                ) : (
                  <Stack gap={0}>
                    <Text fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
                      {slotLabel.title}
                    </Text>
                    {slotLabel.detail && (
                      <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
                        {slotLabel.detail}
                      </Text>
                    )}
                  </Stack>
                )}
              </Box>

              {positions.map((position) => (
                <Flex
                  key={position._id}
                  role="cell"
                  align="center"
                  justify={{ base: "space-between", md: "center" }}
                  gap={3}
                  minW={0}
                >
                  <HStack display={{ base: "flex", md: "none" }} gap={2} minW={0}>
                    <PositionDot color={position.color} />
                    <Text fontSize="sm" color="gray.900" overflowWrap="anywhere">
                      {position.name}
                    </Text>
                  </HStack>
                  <CountStepper
                    label={`${slotLabel.title} ${position.name}`}
                    count={slot.counts[position._id] ?? 0}
                    disabled={!canWrite}
                    onChange={(delta) =>
                      intents.onChangeRequiredCount(
                        { templateRowKey: draft.rowKey, slotRowKey: slot.rowKey, positionId: position._id },
                        delta,
                      )
                    }
                  />
                </Flex>
              ))}
            </Grid>
          );
        })}
      </Stack>
    </Box>
  );
}

type TimeSlotHeaderProps = {
  draft: DayTemplateDraft;
  slot: DayTemplateSlotDraft;
  startTime: string;
  endTime: string;
  label: string;
  pattern: ShiftSetupSubmissionPattern;
  canWrite: boolean;
  intents: ShiftSetupIntents;
};

function TimeSlotHeader({ draft, slot, startTime, endTime, label, pattern, canWrite, intents }: TimeSlotHeaderProps) {
  const target = { templateRowKey: draft.rowKey, slotRowKey: slot.rowKey };

  return (
    <HStack gap={1.5}>
      <NativeSelect.Root size="sm" flex={1} minW={0} disabled={!canWrite}>
        <NativeSelect.Field
          aria-label={`${label}の開始`}
          value={startTime}
          bg="white"
          minH={{ base: "44px", md: "36px" }}
          fontVariantNumeric="tabular-nums"
          onChange={(event) => intents.onChangeTimeSlotRange(target, { startTime: event.target.value })}
        >
          {withCurrentOption(getTimeSlotStartOptions(pattern, endTime), startTime).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <Text fontSize="sm" color="fg.muted" aria-hidden>
        〜
      </Text>
      <NativeSelect.Root size="sm" flex={1} minW={0} disabled={!canWrite}>
        <NativeSelect.Field
          aria-label={`${label}の終了`}
          value={endTime}
          bg="white"
          minH={{ base: "44px", md: "36px" }}
          fontVariantNumeric="tabular-nums"
          onChange={(event) => intents.onChangeTimeSlotRange(target, { endTime: event.target.value })}
        >
          {withCurrentOption(getTimeSlotEndOptions(pattern, startTime), endTime).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <IconButton
        type="button"
        aria-label={`${label}の時間帯を削除`}
        variant="ghost"
        colorPalette="red"
        color="red.600"
        boxSize={{ base: "44px", md: "36px" }}
        flexShrink={0}
        disabled={!canWrite || draft.slots.length <= 1}
        onClick={() => intents.onRemoveSlot(target)}
      >
        <LuTrash2 aria-hidden />
      </IconButton>
    </HStack>
  );
}

/** 選択肢の外にある保存済みの時刻も、選んだ状態で表示できるようにする。 */
function withCurrentOption(options: ReadonlyArray<{ value: string; label: string }>, current: string) {
  return options.some((option) => option.value === current)
    ? options
    : [{ value: current, label: current }, ...options];
}

type CountStepperProps = {
  label: string;
  count: number;
  disabled: boolean;
  onChange: (delta: number) => void;
};

/** 必要人数を−と＋で増減する。0は「未設定」として「—」で示す。 */
function CountStepper({ label, count, disabled, onChange }: CountStepperProps) {
  const buttonSize = { base: "44px", md: "32px" };

  return (
    <HStack role="group" aria-label={`${label}の必要人数`} gap={1} flexShrink={0}>
      <IconButton
        type="button"
        aria-label="1人減らす"
        variant="outline"
        bg="white"
        boxSize={buttonSize}
        minW={buttonSize}
        disabled={disabled || count <= 0}
        onClick={() => onChange(-1)}
      >
        <LuMinus aria-hidden />
      </IconButton>
      <Text
        minW="2.75rem"
        textAlign="center"
        fontSize="md"
        fontVariantNumeric="tabular-nums"
        fontWeight={count > 0 ? "bold" : "normal"}
        color={count > 0 ? "gray.900" : "gray.400"}
        aria-live="polite"
      >
        {count > 0 ? (
          <>
            {count}
            <chakra.span fontSize="xs" fontWeight="normal" ms={0.5}>
              人
            </chakra.span>
          </>
        ) : (
          <>
            <span aria-hidden>—</span>
            <VisuallyHidden>未設定</VisuallyHidden>
          </>
        )}
      </Text>
      <IconButton
        type="button"
        aria-label="1人増やす"
        variant="outline"
        bg="white"
        boxSize={buttonSize}
        minW={buttonSize}
        disabled={disabled || count >= SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX}
        onClick={() => onChange(1)}
      >
        <LuPlus aria-hidden />
      </IconButton>
    </HStack>
  );
}
