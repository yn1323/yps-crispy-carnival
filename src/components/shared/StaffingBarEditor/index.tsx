import { Alert, Stack, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/src/components/ui/Button";
import {
  alignStaffingBarRange,
  countBarsOutsideRange,
  DEFAULT_STAFFING_BAR_LIMITS,
  type EditableStaffingBar,
  STAFFING_BAR_UNIT_MINUTES,
  type StaffingBarLimits,
  type StaffingBarRange,
  type StaffingBarRules,
  trimBarsToRange,
} from "@/src/domains/shift/staffingBars";
import { BarFormDialog, BarFormPanel, type BarFormTarget } from "./BarFormDialog";
import type { StaffingBarEditorPosition, StaffingBarLayout } from "./script";
import { TimelineEditor } from "./TimelineEditor";
import { useStaffingBarLayout } from "./useStaffingBarLayout";

export { RequiredCountStrip, type RequiredCountStripProps } from "./RequiredCountStrip";
export type { StaffingBarEditorPosition, StaffingBarLayout } from "./script";

export type StaffingBarEditorProps = {
  /** バーを置くポジション。並び順は表示順。 */
  positions: readonly StaffingBarEditorPosition[];
  /** 編集中のバー。idは一覧の中で一意にする（toEditableStaffingBars で振れる）。 */
  bars: readonly EditableStaffingBar[];
  onChange: (bars: EditableStaffingBar[]) => void;
  /** バーを置ける範囲（分）。店舗の受付時間にあたる。 */
  range: StaffingBarRange;
  /** 刻み（分）。未指定は30分。 */
  unitMinutes?: number;
  isReadOnly?: boolean;
  /** 同時に重ねられる本数と、全体の本数の上限。未指定は10本と200本。 */
  limits?: StaffingBarLimits;
  /**
   * 未指定なら画面幅で切り替える。どちらもバーの表を出す。
   * narrowは、1日を画面の幅に収め、ポジションごとに「できあがる必要人数」を出す。
   * wideは必要人数を出さないため、使う側が RequiredCountStrip を並べる。
   */
  layout?: StaffingBarLayout;
  /**
   * 時刻を選んで足す・変える入力の出し方。未指定はDialog。
   * この部品をDialogの中に置く場合は "inline" を渡し、Dialogの上にDialogを重ねない。
   */
  formPresentation?: "dialog" | "inline";
};

/**
 * 時間指定の必要人数を、バーで入力する部品。
 * 1本のバーが1人分で、重なったバーの本数が、その時間に必要な人数になる。
 * 足す、伸び縮みさせる、時刻を変える操作のあとは、同じ行で端が接したバーを1本にまとめて onChange へ渡す。
 * 受け取ったバーは、操作があるまでそのまま出す。値は bars と onChange で受け渡し、保存はしない。
 */
export const StaffingBarEditor = ({
  positions,
  bars,
  onChange,
  range,
  unitMinutes = STAFFING_BAR_UNIT_MINUTES,
  isReadOnly = false,
  limits = DEFAULT_STAFFING_BAR_LIMITS,
  layout,
  formPresentation = "dialog",
}: StaffingBarEditorProps) => {
  const resolved = useStaffingBarLayout(layout);
  // 受付時間が刻みにそろっていない店舗でも、バーを置ける範囲を刻みの上に保つ。
  const editableRange = useMemo(() => alignStaffingBarRange(range, unitMinutes), [range, unitMinutes]);
  const rules = useMemo<StaffingBarRules>(
    () => ({ range: editableRange, unitMinutes, limits }),
    [editableRange, unitMinutes, limits],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [formTarget, setFormTarget] = useState<BarFormTarget | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const outsideCount = countBarsOutsideRange(bars, editableRange);

  const openForm = (target: BarFormTarget) => {
    setFormTarget(target);
    setIsFormOpen(true);
  };

  /** 入力を閉じたあとのフォーカスの戻り先。押したバーが残っていればそのバー、消えていればポジションの「時刻を選んで足す」。 */
  const getFormFocusTarget = useCallback((): HTMLElement | null => {
    const root = rootRef.current;
    if (!root || !formTarget) return null;
    const find = (attribute: string, id: string) =>
      Array.from(root.querySelectorAll<HTMLElement>(`[${attribute}]`)).find(
        (element) => element.getAttribute(attribute) === id,
      ) ?? null;
    const bar = formTarget.mode === "edit" ? find("data-staffing-bar", formTarget.bar.id) : null;
    return bar ?? find("data-staffing-add", formTarget.position.id);
  }, [formTarget]);

  // その場に出す入力は、閉じるとフォーカスの行き先がなくなるため、ここで戻す。
  const wasInlineFormOpenRef = useRef(false);
  useEffect(() => {
    if (formPresentation !== "inline") return;
    if (wasInlineFormOpenRef.current && !isFormOpen) getFormFocusTarget()?.focus();
    wasInlineFormOpenRef.current = isFormOpen;
  }, [formPresentation, isFormOpen, getFormFocusTarget]);

  return (
    <Stack ref={rootRef} gap={3}>
      {outsideCount > 0 && (
        <Alert.Root status="warning" borderRadius="lg" alignItems="flex-start" flexWrap="wrap">
          <Alert.Indicator mt={1} />
          <Alert.Content minW={0}>
            <Alert.Title>受付時間の外にあるバーが{outsideCount}本あります</Alert.Title>
            {!isReadOnly && <Alert.Description>受付時間に合わせると、外に出た部分が消えます。</Alert.Description>}
          </Alert.Content>
          {!isReadOnly && (
            <Button
              type="button"
              variant="outline"
              bg="white"
              size="sm"
              minH={{ base: "44px", md: "36px" }}
              // スマートフォンでは文の下へ折り返し、幅いっぱいに置く。
              w={{ base: "full", md: "auto" }}
              flexShrink={0}
              onClick={() => onChange(trimBarsToRange({ bars, range: editableRange, unitMinutes }))}
            >
              受付時間に合わせる
            </Button>
          )}
        </Alert.Root>
      )}
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        重なったバーの本数が、その時間に必要な人数です。だれが入るかはシフト表で決めます。
      </Text>
      {!isReadOnly && formPresentation === "inline" && (
        <BarFormPanel
          target={formTarget}
          isOpen={isFormOpen}
          bars={bars}
          rules={rules}
          onChange={onChange}
          onClose={() => setIsFormOpen(false)}
        />
      )}
      <TimelineEditor
        positions={positions}
        bars={bars}
        rules={rules}
        isReadOnly={isReadOnly}
        layout={resolved.layout}
        isTouch={resolved.isTouch}
        onChange={onChange}
        onOpenAdd={(position) => openForm({ mode: "add", position })}
        onOpenEdit={(position, bar) => openForm({ mode: "edit", position, bar })}
      />
      {!isReadOnly && formPresentation === "dialog" && (
        <BarFormDialog
          target={formTarget}
          isOpen={isFormOpen}
          bars={bars}
          rules={rules}
          onChange={onChange}
          onClose={() => setIsFormOpen(false)}
          finalFocusEl={getFormFocusTarget}
        />
      )}
    </Stack>
  );
};
