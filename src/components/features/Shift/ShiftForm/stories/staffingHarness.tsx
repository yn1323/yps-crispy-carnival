import { type ComponentProps, useMemo, useState } from "react";
import { within } from "storybook/test";
import type { PositionType } from "@/src/domains/shift/types";
import { ShiftForm, type ShiftFormDayRequirements, type ShiftFormStaffing, type ShiftFormStaffingDay } from "..";

// 必要人数のStoryで共有する、fixtureの組み立てと、サーバーの代わりをするハーネス。

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

type BarSpec = [position: PositionType, start: string, end: string, count?: number];
type CountSpec = [position: PositionType, count: number];

/** 時間指定の必要人数。countを渡すと、同じ時間のバーをその本数だけ並べる。 */
export const timeRequirements = (bars: readonly BarSpec[]): ShiftFormDayRequirements => ({
  kind: "time",
  bars: bars.flatMap(([position, startTime, endTime, count = 1]) =>
    Array.from({ length: count }, () => ({ positionId: position.id, startTime, endTime })),
  ),
});

export const staffingCounts = (counts: readonly CountSpec[]) =>
  counts.map(([position, count]) => ({ positionId: position.id, count }));

export type StoryTemplate = { id: string; name: string; requirements: ShiftFormDayRequirements };

/** 曜日の設定でテンプレートが当たっている日。 */
export const templateDay = (
  date: string,
  template: StoryTemplate,
  source: ShiftFormStaffingDay["source"] = "weekday",
): ShiftFormStaffingDay => ({
  date,
  source,
  templateId: source === "confirmed" ? null : template.id,
  templateName: template.name,
  requirements: template.requirements,
});

/** テンプレートが当たらない日。 */
export const unsetDay = (date: string): ShiftFormStaffingDay => ({
  date,
  source: "none",
  templateId: null,
  templateName: null,
  requirements: null,
});

/** その日だけ人数を変えた日。 */
export const customDay = (date: string, requirements: ShiftFormDayRequirements): ShiftFormStaffingDay => ({
  date,
  source: "dateCustom",
  templateId: null,
  templateName: null,
  requirements,
});

export const buildStaffing = (input: {
  templates?: readonly StoryTemplate[];
  days: ShiftFormStaffingDay[];
  isLocked?: boolean;
}): ShiftFormStaffing => ({
  breakRule: null,
  isLocked: input.isLocked ?? false,
  templates: (input.templates ?? []).map(({ id, name }) => ({ id, name })),
  days: input.days,
});

const CALL_LOG_LABEL = "必要人数の操作";

// 記録は検証のためだけに置く。見た目に出さず、レイアウトも変えない。
const visuallyHidden = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
} as const;

type HarnessProps = ShiftFormArgs & {
  /** 当てたときに、その日の必要人数になるテンプレート。 */
  templates: readonly StoryTemplate[];
  /** その日だけの指定を消したときに戻る、曜日の設定の必要人数。渡さない場合は、最初の必要人数へ戻す。 */
  weekdayDays?: readonly ShiftFormStaffingDay[];
};

/**
 * 必要人数の操作を受け取り、サーバーの代わりに日ごとの必要人数を書き換えるハーネス。
 * 受け取った引数は、検証のために「必要人数の操作」へJSONで記録する。
 */
export const StaffingHarness = ({ templates, weekdayDays, ...args }: HarnessProps) => {
  const initialDays = args.staffing?.days ?? [];
  const [days, setDays] = useState<ShiftFormStaffingDay[]>(initialDays);
  const [calls, setCalls] = useState<string[]>([]);
  const [setupOpenCount, setSetupOpenCount] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Storyのargsは描画のたびに作り直されることがあるため、最初の値だけを使う。
  const detailActions = useMemo<NonNullable<ShiftFormArgs["detailActions"]>>(() => {
    const record = (call: unknown) => setCalls((current) => [...current, JSON.stringify(call)]);
    const restoreDays = weekdayDays ?? initialDays;
    return {
      onOpenSetup: () => setSetupOpenCount((current) => current + 1),
      dayStaffingActions: {
        isPending: false,
        onApplyTemplate: async (dates, templateId) => {
          record({ mutation: "applyDayTemplateToDates", dates, templateId });
          const template = templates.find((item) => item.id === templateId);
          setDays((current) =>
            current.map((day) => {
              if (!dates.includes(day.date)) return day;
              if (!template) return restoreDays.find((item) => item.date === day.date) ?? unsetDay(day.date);
              return templateDay(day.date, template, "dateTemplate");
            }),
          );
          return true;
        },
        onSaveCustom: async (date, requirements) => {
          record({ mutation: "saveDayCustomRequirements", date, requirements });
          setDays((current) => current.map((day) => (day.date === date ? customDay(date, requirements) : day)));
          return true;
        },
      },
    };
  }, []);

  const staffing = useMemo(() => (args.staffing ? { ...args.staffing, days } : undefined), [args.staffing, days]);

  return (
    <>
      <output aria-label={CALL_LOG_LABEL} style={visuallyHidden}>
        {JSON.stringify({ calls: calls.map((call) => JSON.parse(call)), setupOpenCount })}
      </output>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ShiftForm {...args} staffing={staffing} detailActions={detailActions} />
      </div>
    </>
  );
};

/** ハーネスが受け取った、必要人数の操作の引数を返す。 */
export const readStaffingCalls = async (
  canvasElement: HTMLElement,
): Promise<{ calls: unknown[]; setupOpenCount: number }> => {
  const output = await within(canvasElement).findByRole("status", { name: CALL_LOG_LABEL });
  return JSON.parse(output.textContent ?? "{}");
};
