import { Alert, chakra, Field, Flex, Grid, Stack, Text } from "@chakra-ui/react";
import { type RefObject, useId, useMemo, useState } from "react";
import { LuCopy, LuTrash2 } from "react-icons/lu";
import {
  SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
} from "@/convex/constants";
import type { ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";
import { DAY_TEMPLATE_ISSUE_MESSAGES } from "@/convex/shiftSetup/dayTemplates";
import { StaffingCountBandEditor } from "@/src/components/shared/StaffingCountBandEditor";
import { StaffingCountTable } from "@/src/components/shared/StaffingCountTable";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Input, NativeSelect } from "@/src/components/ui/FormControls";
import {
  getDayTemplateLabel,
  getRequiredCountRows,
  getRequiredCountTableCounts,
  getStaffingSegmentRange,
  needsDayTemplateReentry,
} from "./dayTemplateDrafts";
import { WEEKDAY_OPTIONS } from "./script";
import type { DayTemplateDraft, ShiftSetupData, ShiftSetupIntents } from "./types";

/** 名前の右に置く操作。スマートフォンでは名前の欄と1行に収めるため、アイコンだけを出す。 */
const ACTION_BUTTON_PROPS = {
  type: "button",
  variant: "ghost",
  size: "sm",
  minH: { base: "44px", md: "36px" },
  minW: { base: "44px", md: "auto" },
  px: { base: 0, md: 3.5 },
  gap: 1.5,
} as const;
const ACTION_LABEL_DISPLAY = { base: "none", md: "inline" } as const;

type Props = {
  draft: DayTemplateDraft;
  drafts: readonly DayTemplateDraft[];
  setup: ShiftSetupData;
  canWrite: boolean;
  issueMessage?: string;
  intents: ShiftSetupIntents;
  /** テンプレート名の欄。テンプレートを足したあとに、ここへフォーカスを移すために受け取る。 */
  nameInputRef: RefObject<HTMLInputElement | null>;
};

/** 名前の欄を見える位置へ送るときに空ける、上（ヘッダー、保存の操作、テンプレートの一覧）と下（メインメニュー）の余白。 */
const NAME_FIELD_SCROLL_MARGIN = { top: "14rem", bottom: "5rem" };

/** 選んだテンプレートの、名前、使う日、必要人数を編集する。 */
export function DayTemplateEditor({ draft, drafts, setup, canWrite, issueMessage, intents, nameInputRef }: Props) {
  const dayLabelId = useId();
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const templateLabel = getDayTemplateLabel(draft);
  const otherDrafts = drafts.filter((candidate) => candidate.rowKey !== draft.rowKey);
  const closedDays = new Set(setup.regularClosedDays);

  return (
    <Stack
      role="group"
      aria-label={templateLabel}
      // 名前、使う日、必要人数の3つのまとまりを、間を空けて見分けられるようにする。
      gap={{ base: 6, md: 8 }}
      px={{ base: 3, md: 5 }}
      pt={{ base: 4, md: 5 }}
      minW={0}
    >
      <Flex gap={{ base: 1, md: 3 }} align="flex-end" justify="space-between" wrap={{ base: "nowrap", md: "wrap" }}>
        <Field.Root flex="1 1 12rem" maxW="20rem" minW={0}>
          <Field.Label fontWeight="semibold" color="gray.900">
            テンプレート名
          </Field.Label>
          <Input
            ref={nameInputRef}
            value={draft.name}
            maxLength={SHIFT_DAY_TEMPLATE_NAME_MAX_LENGTH}
            placeholder="平日"
            bg="white"
            scrollMarginTop={NAME_FIELD_SCROLL_MARGIN.top}
            scrollMarginBottom={NAME_FIELD_SCROLL_MARGIN.bottom}
            disabled={!canWrite}
            // 「通常」「テンプレート2」などの初期値を消さずに打ち替えられるよう、欄に入ったら全体を選ぶ。
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => intents.onRenameDayTemplate(draft.rowKey, event.target.value)}
          />
        </Field.Root>
        <Flex gap={1} flexShrink={0} wrap={{ md: "wrap" }}>
          {otherDrafts.length > 0 && (
            <Button
              {...ACTION_BUTTON_PROPS}
              colorPalette="teal"
              aria-label="コピーする"
              disabled={!canWrite}
              onClick={() => setIsCopyDialogOpen(true)}
            >
              <LuCopy aria-hidden />
              <chakra.span display={ACTION_LABEL_DISPLAY}>コピーする</chakra.span>
            </Button>
          )}
          <Button
            {...ACTION_BUTTON_PROPS}
            colorPalette="red"
            color="red.600"
            aria-label="削除する"
            disabled={!canWrite}
            onClick={() => setIsRemoveDialogOpen(true)}
          >
            <LuTrash2 aria-hidden />
            <chakra.span display={ACTION_LABEL_DISPLAY}>削除する</chakra.span>
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
          テンプレート利用日（複数選択可）
        </Text>
        <Flex role="group" aria-labelledby={dayLabelId} gap={{ base: 2, md: 3 }} wrap="wrap">
          <Grid templateColumns="repeat(7, minmax(0, 1fr))" gap={{ base: 1, md: 1.5 }} flex="1 1 16rem" maxW="26rem">
            {WEEKDAY_OPTIONS.map((day) => {
              const isSelected = draft.weekdays.includes(day.value);
              return (
                <DayToggle
                  key={day.value}
                  label={day.label}
                  name={`${day.label}曜日`}
                  isSelected={isSelected}
                  isClosed={closedDays.has(day.value)}
                  tone={WEEKEND_TONES[day.value]}
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
            tone="holiday"
            disabled={!canWrite}
            isWide
            onToggle={() => intents.onToggleHoliday(draft.rowKey)}
          />
          {/* 曜日を1つも選んでいない状態を示す。押すと曜日をすべて外し、祝日はそのまま残す。 */}
          <DayToggle
            label="指定しない"
            name="曜日を指定しない"
            isSelected={draft.weekdays.length === 0}
            isClosed={false}
            disabled={!canWrite}
            isWide
            onToggle={() => intents.onClearWeekdays(draft.rowKey)}
          />
        </Flex>
      </Stack>

      {needsDayTemplateReentry(draft) && (
        <Alert.Root status="warning" borderRadius="lg">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>希望シフトの集め方を変更したため、再設定が必要です。</Alert.Title>
          </Alert.Content>
        </Alert.Root>
      )}

      <Requirements draft={draft} setup={setup} canWrite={canWrite} intents={intents} />

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
        title="テンプレートを削除"
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
          「{templateLabel}」を削除します。
          <br />
          よろしいですか？
        </Text>
      </Dialog>
    </Stack>
  );
}

type RequirementsProps = Pick<Props, "draft" | "setup" | "canWrite" | "intents">;

/** 必要人数の入力。時間指定は時間の帯、パターン選択と日付選択は数字の表で入れる。 */
function Requirements({ draft, setup, canWrite, intents }: RequirementsProps) {
  const { requirements } = draft;
  const pattern = setup.submissionPattern;
  const positions = useMemo(
    () => setup.positions.map((position) => ({ id: position._id, name: position.name, color: position.color })),
    [setup.positions],
  );
  const range = useMemo(() => getStaffingSegmentRange(pattern), [pattern]);

  // 編集の途中で希望シフトの集め方が変わったテンプレートは、いまの集め方の入力欄へ出せない。
  if (requirements.kind !== pattern.kind) {
    return (
      <Text role="alert" fontSize="sm" fontWeight="semibold" color="red.600" pb={{ base: 4, md: 5 }}>
        {DAY_TEMPLATE_ISSUE_MESSAGES.REQUIREMENTS_KIND_MISMATCH}
      </Text>
    );
  }

  if (requirements.kind === "time" && range) {
    return (
      <Stack pb={{ base: 4, md: 5 }}>
        <StaffingCountBandEditor
          positions={positions}
          segments={requirements.segments}
          onChange={(segments) => intents.onChangeSegments(draft.rowKey, segments)}
          range={range}
          isReadOnly={!canWrite}
          maxCount={SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT}
        />
      </Stack>
    );
  }

  if (requirements.kind === "time") return null;

  return (
    <Stack pb={{ base: 4, md: 5 }}>
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

type DayTone = "saturday" | "sunday" | "holiday";

/** 土曜は青、日曜と祝日は赤。選択中は地が濃いため、白のままにする。 */
const DAY_TONE_COLORS: Record<DayTone, string> = { saturday: "blue.600", sunday: "red.600", holiday: "red.600" };
const WEEKEND_TONES: Partial<Record<ShiftSetupWeekday, DayTone>> = { sat: "saturday", sun: "sunday" };

type DayToggleProps = {
  /** ボタンに出す文字。 */
  label: string;
  /** 読み上げに使う名前。 */
  name: string;
  isSelected: boolean;
  isClosed: boolean;
  /** 土曜、日曜、祝日。シフト表と同じく、文字の色で見分けられるようにする。 */
  tone?: DayTone;
  disabled: boolean;
  /** 曜日の列に並べず、文字の幅に合わせて広げる。 */
  isWide?: boolean;
  onToggle: () => void;
};

function DayToggle({ label, name, isSelected, isClosed, tone, disabled, isWide = false, onToggle }: DayToggleProps) {
  const accessibleLabel = [name, ...(isClosed ? ["定休日"] : [])].join("・");

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
        : { bg: "white", borderColor: "gray.300", color: "gray.800", _active: { bg: "gray.100" } })}
      onClick={onToggle}
    >
      <chakra.span aria-hidden color={tone && !isSelected ? DAY_TONE_COLORS[tone] : undefined}>
        {label}
      </chakra.span>
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

/** コピー元のテンプレートを選び、いまの必要人数が置き換わることを確かめてから写す。 */
function CopyRequirementsDialog({ isOpen, templateLabel, sources, onClose, onCopy }: CopyDialogProps) {
  const [selectedRowKey, setSelectedRowKey] = useState<string>();
  // コピー元を選んだあとで、そのテンプレートが一覧からなくなった場合は、先頭のテンプレートへ戻す。
  const source = sources.find((candidate) => candidate.rowKey === selectedRowKey) ?? sources[0];

  return (
    <Dialog
      title="別テンプレートの人員設定をコピーする"
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
          <Field.Label>コピーもとテンプレート</Field.Label>
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
          「{templateLabel}」に反映します。
        </Text>
      </Stack>
    </Dialog>
  );
}
