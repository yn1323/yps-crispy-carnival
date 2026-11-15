import { chakra, Field, Grid, Stack, Text } from "@chakra-ui/react";
import { type FormEvent, useState } from "react";
import { LuPencil } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Select } from "@/src/components/ui/Select";
import { SegmentedRadio, SetupCard, SetupSection } from "./parts";
import {
  type BreakRuleFormErrors,
  formatBreakRule,
  getBreakRuleBreakOptions,
  getBreakRuleWorkOptions,
  parseBreakRuleForm,
} from "./script";
import type { DialogState, ShiftSetupBreakRule, ShiftSetupSubmissionPattern } from "./types";

const FORM_ID = "shift-setup-break-rule-form";
// Dialogの中でも選択肢が切れないよう、店舗設定の時刻Selectと同じ配置にする。
const DIALOG_SELECT_POSITIONING = { strategy: "fixed" as const, hideWhenDetached: true, sameWidth: true };

type RuleMode = "enabled" | "none";

const RULE_MODE_OPTIONS: ReadonlyArray<{ value: RuleMode; label: string }> = [
  { value: "enabled", label: "決まりを使う" },
  { value: "none", label: "決まりなし" },
];

type Props = {
  breakRule: ShiftSetupBreakRule | null;
  patternKind: ShiftSetupSubmissionPattern["kind"];
  canWrite: boolean;
  dialog: DialogState & { isSaving: boolean };
  onSave: (breakRule: ShiftSetupBreakRule | null) => void;
};

export function BreakRuleSection({ breakRule, patternKind, canWrite, dialog, onSave }: Props) {
  const isDateOnly = patternKind === "dateOnly";

  return (
    <SetupSection
      headingId="shift-setup-break-rule-heading"
      title="休憩の決まり"
      action={
        <Button
          type="button"
          variant="ghost"
          colorPalette="teal"
          size="sm"
          gap={1.5}
          fontWeight="semibold"
          flexShrink={0}
          disabled={!canWrite}
          onClick={dialog.open}
        >
          <LuPencil aria-hidden />
          編集する
        </Button>
      }
    >
      <SetupCard>
        <Stack gap={1} px={{ base: 4, md: 5 }} py={4}>
          <Text fontSize="md" fontWeight="semibold" color="gray.900">
            {breakRule ? `${formatBreakRule(breakRule)}の休憩` : formatBreakRule(null)}
          </Text>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {isDateOnly
              ? "日付選択では勤務の長さが決まらないため、休憩は自動では入りません。"
              : breakRule
                ? "シフト表の「くわしく」表示で勤務を作ると、この休憩が初期値として入ります。"
                : "決まりを作ると、シフト表の「くわしく」表示で勤務を作るときに、休憩が初期値として入ります。"}
          </Text>
        </Stack>
      </SetupCard>

      <Dialog
        title="休憩の決まりを編集"
        isOpen={dialog.isOpen && canWrite}
        onOpenChange={dialog.onOpenChange}
        onClose={dialog.close}
        formId={FORM_ID}
        submitLabel="保存する"
        isLoading={dialog.isSaving}
        maxW={{ md: "520px" }}
      >
        <BreakRuleForm
          key={dialog.isOpen ? "open" : "closed"}
          breakRule={breakRule}
          disabled={dialog.isSaving}
          onSubmit={onSave}
        />
      </Dialog>
    </SetupSection>
  );
}

type FormProps = {
  breakRule: ShiftSetupBreakRule | null;
  disabled: boolean;
  onSubmit: (breakRule: ShiftSetupBreakRule | null) => void;
};

function BreakRuleForm({ breakRule, disabled, onSubmit }: FormProps) {
  const [mode, setMode] = useState<RuleMode>(breakRule ? "enabled" : "none");
  const [minWorkMinutes, setMinWorkMinutes] = useState(breakRule ? String(breakRule.minWorkMinutes) : "");
  const [breakMinutes, setBreakMinutes] = useState(breakRule ? String(breakRule.breakMinutes) : "");
  const [errors, setErrors] = useState<BreakRuleFormErrors>({});

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "none") {
      onSubmit(null);
      return;
    }
    const parsed = parseBreakRuleForm({ minWorkMinutes, breakMinutes });
    if ("errors" in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    onSubmit(parsed.rule);
  };

  return (
    <chakra.form id={FORM_ID} noValidate onSubmit={handleSubmit}>
      <Stack gap={4}>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          シフト表の「くわしく」表示で、ここで選んだ長さ以上の勤務を作ると、休憩が初期値として入ります。
          <br />
          長さは店舗の決まりに合わせて選んでください。
        </Text>

        <SegmentedRadio
          name="shift-setup-break-rule-mode"
          label="休憩の決まり"
          value={mode}
          options={RULE_MODE_OPTIONS}
          disabled={disabled}
          onChange={setMode}
        />

        {mode === "enabled" && (
          <Grid templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }} gap={3}>
            <Field.Root invalid={!!errors.minWorkMinutes}>
              <Select
                label="勤務の長さ"
                items={getBreakRuleWorkOptions(breakRule?.minWorkMinutes)}
                value={minWorkMinutes}
                onChange={setMinWorkMinutes}
                placeholder="選択してください"
                usePortal={false}
                positioning={DIALOG_SELECT_POSITIONING}
                invalid={!!errors.minWorkMinutes}
                disabled={disabled}
              />
              {errors.minWorkMinutes && <Field.ErrorText>{errors.minWorkMinutes}</Field.ErrorText>}
            </Field.Root>
            <Field.Root invalid={!!errors.breakMinutes}>
              <Select
                label="休憩の長さ"
                items={getBreakRuleBreakOptions(breakRule?.breakMinutes)}
                value={breakMinutes}
                onChange={setBreakMinutes}
                placeholder="選択してください"
                usePortal={false}
                positioning={DIALOG_SELECT_POSITIONING}
                invalid={!!errors.breakMinutes}
                disabled={disabled}
              />
              {errors.breakMinutes && <Field.ErrorText>{errors.breakMinutes}</Field.ErrorText>}
            </Field.Root>
          </Grid>
        )}

        {mode === "enabled" && minWorkMinutes && breakMinutes && (
          <Text fontSize="sm" fontWeight="semibold" color="gray.900">
            {formatBreakRule({ minWorkMinutes: Number(minWorkMinutes), breakMinutes: Number(breakMinutes) })}
            の休憩が入ります
          </Text>
        )}
      </Stack>
    </chakra.form>
  );
}
