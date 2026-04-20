import { forwardRef, useEffect, useState } from "react";
import type { ShiftData } from "@/src/components/features/Shift/ShiftForm/types";
import { type EventData, Tour, type TourHandle, type TourStep } from "@/src/components/ui/Tour";

const PC_BREAKPOINT = 1024;

const STAFF_ID = {
  add: "s3", // 田中次郎（未提出 → 追加対象）
  edit: "s5", // 高橋翔太（9-20 → 短縮対象）
  delete: "s7", // 伊藤健一（月曜NG → 削除対象）
} as const;

/** Day1 初期値（mocks.ts の 高橋翔太 2026-01-20 と一致） */
const INITIAL_EDIT = { start: "09:00", end: "20:00" } as const;

const STEPS: TourStep[] = [
  {
    target: `[data-tour="shift-row-${STAFF_ID.add}"]`,
    placement: "bottom",
    title: "朝9時が薄いです",
    content: "田中さんの行を 9時から13時まで 横にドラッグして追加しましょう。",
  },
  {
    target: `[data-tour="shift-row-${STAFF_ID.edit}"]`,
    placement: "bottom",
    title: "高橋さんが11時間連続",
    content: "バーの右端をつまんで 16時まで短くしましょう。",
  },
  {
    target: `[data-tour="shift-row-${STAFF_ID.delete}"]`,
    placement: "bottom",
    title: "伊藤さんから連絡",
    content: "月曜は都合が悪いそうです。バーをクリックして 削除を選びましょう。",
  },
  {
    target: '[data-tour="confirm-button"]',
    placement: "top-end",
    title: "いい感じになりました",
    content: "確定ボタンでスタッフ全員にメールが届きます。やったのは 追加 編集 削除 だけ。",
  },
];

/** 現在の shifts 状態から、次に案内すべきステップの index を導出する純粋関数 */
function determineStepIndex(shifts: ShiftData[], day1: string): number {
  const findShift = (staffId: string) => shifts.find((s) => s.staffId === staffId && s.date === day1);

  const addShift = findShift(STAFF_ID.add);
  if (!addShift || addShift.positions.length === 0) return 0;

  const editShift = findShift(STAFF_ID.edit);
  const editUnchanged =
    !editShift ||
    editShift.positions.length === 0 ||
    (editShift.positions[0].start === INITIAL_EDIT.start &&
      editShift.positions[editShift.positions.length - 1].end === INITIAL_EDIT.end);
  if (editUnchanged) return 1;

  const deleteShift = findShift(STAFF_ID.delete);
  if (deleteShift && deleteShift.positions.length > 0) return 2;

  return 3;
}

type Props = {
  run: boolean;
  shifts: ShiftData[];
  /** 週の月曜（Day1）のYYYY-MM-DD。進行判定はこの日付のシフトだけで行う */
  day1: string;
  /** Escape キー等で joyride が tour:end を投げた時のハンドラ */
  onClose: () => void;
};

/**
 * シフト操作でステップを進めていく event-driven ツアー。
 * 単一の `<Tour>` インスタンスを stepIndex controlled で進めるので
 * ステップ遷移では内部の portal が再作成されず、残骸が積み重ならない。
 * 終了は親が ref.skip() を呼ぶ前提（公式推奨の終了手続き）。
 */
export const DemoIntroTour = forwardRef<TourHandle, Props>(({ run, shifts, day1, onClose }, ref) => {
  const [isPcViewport, setIsPcViewport] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsPcViewport(window.innerWidth >= PC_BREAKPOINT);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  if (!isPcViewport) return null;

  const stepIndex = determineStepIndex(shifts, day1);

  const handleEvent = (data: EventData) => {
    if (data.type === "tour:end") onClose();
  };

  return <Tour ref={ref} run={run} steps={STEPS} stepIndex={stepIndex} onEvent={handleEvent} />;
});

DemoIntroTour.displayName = "DemoIntroTour";
