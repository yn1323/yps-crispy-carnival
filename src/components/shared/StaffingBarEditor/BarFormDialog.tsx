import { Box, chakra, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { NativeSelect } from "@/src/components/ui/FormControls";
import {
  addStaffingBars,
  type EditableStaffingBar,
  removeStaffingBars,
  type StaffingBarGroup,
  type StaffingBarResult,
  type StaffingBarRules,
  setStaffingBarGroup,
} from "@/src/domains/shift/staffingBars";
import { minutesToTime } from "@/src/domains/shift/time";
import { BarTimeFields } from "./BarTimeFields";
import { buildTimeOptions, getRejectionMessage, type StaffingBarEditorPosition } from "./script";

/** 開く対象。足すときはポジションだけ、変えるときは一覧でまとめたバーも持つ。 */
export type BarFormTarget =
  | { mode: "add"; position: StaffingBarEditorPosition }
  | { mode: "edit"; position: StaffingBarEditorPosition; group: StaffingBarGroup };

type BarFormDialogProps = {
  /** 最後に開いた対象。閉じるアニメーションの間も内容を保つため、閉じてもnullに戻さない。 */
  target: BarFormTarget | null;
  isOpen: boolean;
  bars: readonly EditableStaffingBar[];
  rules: StaffingBarRules;
  onChange: (bars: EditableStaffingBar[]) => void;
  onClose: () => void;
};

/**
 * 時刻と本数を選んでバーを足す、または一覧でまとめたバーを変えるDialog。
 * ドラッグを使わずに、キーボードとスマートフォンで同じことができるようにする。
 */
export const BarFormDialog = ({ target, isOpen, bars, rules, onChange, onClose }: BarFormDialogProps) => {
  const formId = useId();
  if (!target) return null;

  return (
    <Dialog
      title={getBarFormTitle(target)}
      isOpen={isOpen}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      onClose={onClose}
      formId={formId}
      submitLabel={getBarFormSubmitLabel(target)}
      unmountOnExit
    >
      <BarForm
        key={`${target.mode}-${target.position.id}-${target.mode === "edit" ? target.group.barIds.join(",") : ""}`}
        formId={formId}
        target={target}
        bars={bars}
        rules={rules}
        onChange={onChange}
        onClose={onClose}
      />
    </Dialog>
  );
};

const getBarFormTitle = (target: BarFormTarget) =>
  target.mode === "add" ? `${target.position.name}のバーを足す` : `${target.position.name}のバーを変える`;
const getBarFormSubmitLabel = (target: BarFormTarget) => (target.mode === "add" ? "足す" : "変更する");

/**
 * BarFormDialogと同じ入力を、Dialogを開かずにその場へ出す。
 * すでにDialogの中にある編集部品で使い、Dialogの上にDialogを重ねない。
 */
export const BarFormPanel = ({ target, isOpen, bars, rules, onChange, onClose }: BarFormDialogProps) => {
  const formId = useId();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const targetKey = target
    ? `${target.mode}-${target.position.id}-${target.mode === "edit" ? target.group.barIds.join(",") : ""}`
    : "";

  // 開いたら、入力が見える位置へ寄せて最初の入力へフォーカスを移す。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 対象が変わったときにも寄せ直す。
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    panel.scrollIntoView({ block: "nearest" });
    panel.querySelector<HTMLElement>("select, input, button")?.focus();
  }, [isOpen, targetKey]);

  if (!target || !isOpen) return null;

  return (
    <Box
      ref={panelRef}
      role="group"
      aria-labelledby={titleId}
      borderWidth="1px"
      borderColor="gray.300"
      borderRadius="lg"
      bg="gray.50"
      p={4}
    >
      <Text id={titleId} fontSize="md" fontWeight="bold" color="gray.900" mb={3}>
        {getBarFormTitle(target)}
      </Text>
      <BarForm
        key={targetKey}
        formId={formId}
        target={target}
        bars={bars}
        rules={rules}
        onChange={onChange}
        onClose={onClose}
      />
      <Flex justify="flex-end" gap={2} mt={4}>
        <Button type="button" variant="outline" bg="white" minH={{ base: "44px", md: "36px" }} onClick={onClose}>
          やめる
        </Button>
        <Button type="submit" form={formId} colorPalette="teal" minH={{ base: "44px", md: "36px" }}>
          {getBarFormSubmitLabel(target)}
        </Button>
      </Flex>
    </Box>
  );
};

type BarFormProps = Omit<BarFormDialogProps, "isOpen" | "target"> & { formId: string; target: BarFormTarget };

// 入力は開くたびに作り直す。Dialogが閉じたあとにこの部品を外すため、初期値はmountのときだけ決める。
const BarForm = ({ formId, target, bars, rules, onChange, onClose }: BarFormProps) => {
  const timeOptions = useMemo(() => buildTimeOptions(rules), [rules]);
  const [time, setTime] = useState(() =>
    target.mode === "edit"
      ? { start: target.group.start, end: target.group.end }
      : {
          // 選択肢と同じく、刻みに乗る内側の端から端までを初期値にする。
          start: timeOptions[0]?.value ?? minutesToTime(rules.range.startMinutes),
          end: timeOptions.at(-1)?.value ?? minutesToTime(rules.range.endMinutes),
        },
  );
  const [count, setCount] = useState(target.mode === "edit" ? target.group.barIds.length : 1);
  const [error, setError] = useState<string | null>(null);
  // 上限を超えて保存されていた本数も、選択肢に残して表示する。
  const maxCount = Math.max(rules.limits.maxConcurrentPerPosition, count);

  const apply = (result: StaffingBarResult) => {
    if (!result.ok) {
      setError(getRejectionMessage(result.reason, rules));
      return;
    }
    onChange(result.bars);
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (target.mode === "add") {
      apply(addStaffingBars({ bars, bar: { positionId: target.position.id, ...time }, count, rules }));
      return;
    }
    apply(setStaffingBarGroup({ bars, barIds: target.group.barIds, ...time, count, rules }));
  };

  const handleDelete = () => {
    if (target.mode !== "edit") return;
    onChange(removeStaffingBars(bars, target.group.barIds));
    onClose();
  };

  return (
    <chakra.form id={formId} onSubmit={handleSubmit} noValidate>
      <Stack gap={4}>
        <BarTimeFields
          start={time.start}
          end={time.end}
          options={timeOptions}
          onChange={(next) => {
            setTime(next);
            setError(null);
          }}
        />
        <Field.Root>
          <Field.Label>本数</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={String(count)}
              bg="white"
              minH={{ base: "44px", md: "36px" }}
              fontVariantNumeric="tabular-nums"
              onChange={(event) => {
                setCount(Number(event.target.value));
                setError(null);
              }}
            >
              {Array.from({ length: maxCount }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}本
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Field.HelperText>1本が1人分です</Field.HelperText>
        </Field.Root>
        {error && (
          <Text role="alert" fontSize="sm" color="red.600">
            {error}
          </Text>
        )}
        {target.mode === "edit" && (
          <Flex justify="flex-end" pt={3} borderTopWidth="1px" borderColor="gray.100">
            <Button
              type="button"
              variant="ghost"
              colorPalette="red"
              color="red.600"
              size="sm"
              minH={{ base: "44px", md: "36px" }}
              gap={1.5}
              onClick={handleDelete}
            >
              <LuTrash2 aria-hidden />
              {target.group.barIds.length > 1 ? `${target.group.barIds.length}本とも削除` : "削除"}
            </Button>
          </Flex>
        )}
      </Stack>
    </chakra.form>
  );
};
