import { Alert, Box, chakra, Field, Flex, Grid, Stack, Text } from "@chakra-ui/react";
import { useId, useMemo, useState } from "react";
import { LuCopy, LuTrash2 } from "react-icons/lu";
import { SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH, SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX } from "@/convex/constants";
import { DAY_TEMPLATE_ISSUE_MESSAGES } from "@/convex/shiftSetup/dayTemplates";
import { RequiredCountStrip, StaffingBarEditor } from "@/src/components/shared/StaffingBarEditor";
import { StaffingCountTable } from "@/src/components/shared/StaffingCountTable";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Input, NativeSelect } from "@/src/components/ui/FormControls";
import {
  DAY_TEMPLATE_BAR_LIMITS,
  getDayTemplateLabel,
  getRequiredCountRows,
  getRequiredCountTableCounts,
  getStaffingBarRange,
  needsDayTemplateReentry,
} from "./dayTemplateDrafts";
import { WEEKDAY_OPTIONS } from "./script";
import type { DayTemplateDraft, ShiftSetupData, ShiftSetupIntents } from "./types";

const COUNT_TABLE_DESCRIPTIONS = {
  shiftType: "勤務パターンごとに、必要な人数をポジション別に入れます。空欄は未設定です。",
  dateOnly: "1日に必要な人数をポジション別に入れます。空欄は未設定です。",
} as const;

const ACTION_BUTTON_HEIGHT = { base: "44px", md: "36px" };

type Props = {
  draft: DayTemplateDraft;
  drafts: readonly DayTemplateDraft[];
  setup: ShiftSetupData;
  canWrite: boolean;
  issueMessage?: string;
  intents: ShiftSetupIntents;
  /** PCで「できあがる必要人数」を画面の下端に留めるときの、下端からの距離（px）。 */
  requiredCountBottomOffset: number;
};

/** 選んだ型の、名前、使う日、必要人数を編集する。 */
export function DayTemplateEditor({
  draft,
  drafts,
  setup,
  canWrite,
  issueMessage,
  intents,
  requiredCountBottomOffset,
}: Props) {
  const dayLabelId = useId();
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const templateLabel = getDayTemplateLabel(draft);
  const otherDrafts = drafts.filter((candidate) => candidate.rowKey !== draft.rowKey);
  const closedDays = new Set(setup.regularClosedDays);
  const holidayOwner = draft.appliesToHolidays ? undefined : otherDrafts.find((other) => other.appliesToHolidays);
  const dayNotes = [
    "祝日は曜日より優先します。",
    ...(canWrite && otherDrafts.length > 0 ? ["別の型が使っている日を押すと、この型へ移ります。"] : []),
    ...(closedDays.size > 0 ? ["「休」は定休日です。"] : []),
    ...(draft.weekdays.length === 0 && !draft.appliesToHolidays
      ? ["曜日も祝日も選ばない型は、シフト表で日付を選んで当てられます。"]
      : []),
  ];

  return (
    <Stack
      role="group"
      aria-label={templateLabel}
      gap={{ base: 4, md: 5 }}
      px={{ base: 3, md: 5 }}
      pt={{ base: 4, md: 5 }}
      minW={0}
    >
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
        <Flex gap={1} wrap="wrap">
          {otherDrafts.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              colorPalette="teal"
              size="sm"
              minH={ACTION_BUTTON_HEIGHT}
              gap={1.5}
              disabled={!canWrite}
              onClick={() => setIsCopyDialogOpen(true)}
            >
              <LuCopy aria-hidden />
              ほかの型からコピー
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            colorPalette="red"
            color="red.600"
            size="sm"
            minH={ACTION_BUTTON_HEIGHT}
            gap={1.5}
            disabled={!canWrite}
            onClick={() => setIsRemoveDialogOpen(true)}
          >
            <LuTrash2 aria-hidden />
            この型を削除
          </Button>
        </Flex>
      </Flex>

      {issueMessage && (
        <Text role="alert" fontSize="sm" fontWeight="semibold" color="red.600">
          {issueMessage}
        </Text>
      )}

      <Stack gap={2}>
        <Text id={dayLabelId} fontSize="sm" fontWeight="semibold" color="gray.900">
          この型を使う日
        </Text>
        <Flex role="group" aria-labelledby={dayLabelId} gap={{ base: 2, md: 3 }} wrap="wrap">
          <Grid templateColumns="repeat(7, minmax(0, 1fr))" gap={{ base: 1, md: 1.5 }} flex="1 1 16rem" maxW="26rem">
            {WEEKDAY_OPTIONS.map((day) => {
              const isSelected = draft.weekdays.includes(day.value);
              const owner = isSelected ? undefined : otherDrafts.find((other) => other.weekdays.includes(day.value));
              return (
                <DayToggle
                  key={day.value}
                  label={day.label}
                  name={`${day.label}曜日`}
                  isSelected={isSelected}
                  isClosed={closedDays.has(day.value)}
                  ownerLabel={owner ? getDayTemplateLabel(owner) : undefined}
                  disabled={!canWrite}
                  onToggle={() => intents.onToggleWeekday(draft.rowKey, day.value)}
                />
              );
            })}
          </Grid>
          <DayToggle
            label="祝日"
            name="祝日"
            isSelected={draft.appliesToHolidays}
            isClosed={false}
            ownerLabel={holidayOwner ? getDayTemplateLabel(holidayOwner) : undefined}
            disabled={!canWrite}
            isWide
            onToggle={() => intents.onToggleHoliday(draft.rowKey)}
          />
        </Flex>
        <Text fontSize="xs" color="fg.muted" lineHeight="tall">
          {dayNotes.join("")}
        </Text>
      </Stack>

      {needsDayTemplateReentry(draft) && (
        <Alert.Root status="warning" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>希望シフトの集め方を変えたため、必要人数を入れ直してください</Alert.Title>
          </Alert.Content>
        </Alert.Root>
      )}

      <Requirements
        draft={draft}
        setup={setup}
        canWrite={canWrite}
        intents={intents}
        requiredCountBottomOffset={requiredCountBottomOffset}
      />

      <CopyRequirementsDialog
        isOpen={isCopyDialogOpen && canWrite}
        templateLabel={templateLabel}
        sources={otherDrafts}
        onClose={() => setIsCopyDialogOpen(false)}
        onCopy={(fromRowKey) => {
          intents.onCopyRequirements({ fromRowKey, toRowKey: draft.rowKey });
          setIsCopyDialogOpen(false);
        }}
      />
      <Dialog
        title="型を削除"
        isOpen={isRemoveDialogOpen && canWrite}
        onOpenChange={({ open }) => {
          if (!open) setIsRemoveDialogOpen(false);
        }}
        onClose={() => setIsRemoveDialogOpen(false)}
        role="alertdialog"
        onSubmit={() => {
          setIsRemoveDialogOpen(false);
          intents.onRemoveDayTemplate(draft.rowKey);
        }}
        submitLabel="削除する"
        submitColorPalette="red"
      >
        <Text fontSize="sm" lineHeight="tall">
          「{templateLabel}」と、その必要人数を削除します。
          <br />
          保存するまでは「元に戻す」で取り消せます。
        </Text>
      </Dialog>
    </Stack>
  );
}

type RequirementsProps = Pick<Props, "draft" | "setup" | "canWrite" | "intents" | "requiredCountBottomOffset">;

/** 必要人数の入力。時間指定はバー、パターン選択と日付選択は数字の表で入れる。 */
function Requirements({ draft, setup, canWrite, intents, requiredCountBottomOffset }: RequirementsProps) {
  const { requirements } = draft;
  const pattern = setup.submissionPattern;
  const positions = useMemo(
    () => setup.positions.map((position) => ({ id: position._id, name: position.name, color: position.color })),
    [setup.positions],
  );
  const range = useMemo(() => getStaffingBarRange(pattern), [pattern]);

  // 編集の途中で希望シフトの集め方が変わった型は、いまの集め方の入力欄へ出せない。
  if (requirements.kind !== pattern.kind) {
    return (
      <Text role="alert" fontSize="sm" fontWeight="semibold" color="red.600" pb={{ base: 4, md: 5 }}>
        {DAY_TEMPLATE_ISSUE_MESSAGES.REQUIREMENTS_KIND_MISMATCH}
      </Text>
    );
  }

  if (requirements.kind === "time" && range) {
    return (
      <Stack gap={{ base: 4, lg: 3 }}>
        <StaffingBarEditor
          positions={positions}
          bars={requirements.bars}
          onChange={(bars) => intents.onChangeBars(draft.rowKey, bars)}
          range={range}
          isReadOnly={!canWrite}
          limits={DAY_TEMPLATE_BAR_LIMITS}
        />
        <Box
          // バーの行が増えても人数を確かめられるよう、PCでは画面の下端に留める。
          // スマートフォンは一覧が縦に長くなるため留めず、バーの一覧の下に置く。
          position={{ lg: "sticky" }}
          bottom={{ lg: `${requiredCountBottomOffset}px` }}
          zIndex={{ lg: "docked" }}
          maxH={{ lg: "40dvh" }}
          overflowY={{ lg: "auto" }}
          mx={{ base: -3, md: -5 }}
          px={{ base: 3, md: 5 }}
          py={{ base: 4, lg: 3 }}
          bg="white"
          borderTopWidth="1px"
          borderColor="gray.200"
          borderBottomRightRadius="xl"
          borderBottomLeftRadius={{ base: "xl", lg: 0 }}
          boxShadow={{ lg: "0 -6px 12px -10px rgba(0, 0, 0, 0.3)" }}
        >
          <RequiredCountStrip positions={positions} bars={requirements.bars} range={range} />
        </Box>
      </Stack>
    );
  }

  if (requirements.kind === "time") return null;

  return (
    <Stack gap={2} pb={{ base: 4, md: 5 }}>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        {COUNT_TABLE_DESCRIPTIONS[requirements.kind]}
      </Text>
      <StaffingCountTable
        positions={positions}
        rows={getRequiredCountRows(pattern)}
        counts={getRequiredCountTableCounts(requirements)}
        onChange={(rowId, positionId, count) =>
          intents.onChangeRequiredCount(draft.rowKey, { rowId, positionId, count })
        }
        isReadOnly={!canWrite}
        max={SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX}
      />
    </Stack>
  );
}

type DayToggleProps = {
  /** ボタンに出す文字。 */
  label: string;
  /** 読み上げに使う名前。 */
  name: string;
  isSelected: boolean;
  isClosed: boolean;
  /** この日を持っている別の型の名前。 */
  ownerLabel?: string;
  disabled: boolean;
  /** 曜日の列に並べず、文字の幅に合わせて広げる。 */
  isWide?: boolean;
  onToggle: () => void;
};

function DayToggle({
  label,
  name,
  isSelected,
  isClosed,
  ownerLabel,
  disabled,
  isWide = false,
  onToggle,
}: DayToggleProps) {
  const accessibleLabel = [
    name,
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
      minW={isWide ? "4.5rem" : 0}
      px={isWide ? 3 : 0}
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

type CopyDialogProps = {
  isOpen: boolean;
  templateLabel: string;
  sources: readonly DayTemplateDraft[];
  onClose: () => void;
  onCopy: (fromRowKey: string) => void;
};

/** コピー元の型を選び、いまの必要人数が置き換わることを確かめてから写す。 */
function CopyRequirementsDialog({ isOpen, templateLabel, sources, onClose, onCopy }: CopyDialogProps) {
  const [selectedRowKey, setSelectedRowKey] = useState<string>();
  // コピー元を選んだあとで、その型が一覧からなくなった場合は、先頭の型へ戻す。
  const source = sources.find((candidate) => candidate.rowKey === selectedRowKey) ?? sources[0];

  return (
    <Dialog
      title="ほかの型からコピー"
      isOpen={isOpen && source !== undefined}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      onSubmit={() => {
        if (source) onCopy(source.rowKey);
      }}
      submitLabel="コピーする"
    >
      <Stack gap={4}>
        <Field.Root>
          <Field.Label>コピーする型</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              value={source?.rowKey ?? ""}
              bg="white"
              minH={{ base: "44px", md: "40px" }}
              onChange={(event) => setSelectedRowKey(event.target.value)}
            >
              {sources.map((candidate) => (
                <option key={candidate.rowKey} value={candidate.rowKey}>
                  {getDayTemplateLabel(candidate)}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Text fontSize="sm" lineHeight="tall">
          「{templateLabel}」の必要人数は、選んだ型の内容で置き換わります。
          <br />
          名前と使う日は変わりません。
        </Text>
      </Stack>
    </Dialog>
  );
}
