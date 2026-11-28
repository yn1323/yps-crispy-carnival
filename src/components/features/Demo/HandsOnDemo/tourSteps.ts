// シフト表の吹き出しと、右下の「やること」の文言。手順の番号はprogress.tsの判定と同じ並びにする。
import type { TourStep } from "@/src/components/ui/Tour";
import type { HandsOnVariant } from "./progress";
import { BREAK_STAFF_ID, SATO_STAFF_ID } from "./scenario";

/** 吹き出しに「次へ」を出す手順。読むだけで、進める操作がない手順に付ける。 */
export type HandsOnTourStepData = { showsNext?: boolean };

const rowOf = (staffId: string) => `[data-tour="shift-row-${staffId}"]`;

const REQUEST_STEP = {
  target: rowOf(SATO_STAFF_ID),
  placement: "bottom",
  title: "点線が希望シフトです",
  data: { showsNext: true } satisfies HandsOnTourStepData,
} as const;

const SET_WORK_TIME_STEP = {
  target: rowOf(SATO_STAFF_ID),
  title: "勤務時間を設定しましょう",
  content: "佐藤さんの行を17時から22時までドラッグしましょう。",
} as const;

const CONFIRM_STEP = {
  target: '[data-tour="confirm-button"]',
  placement: "bottom-end",
  title: "確定する",
  content: "スタッフにシフトが届きます。",
} as const;

export const HANDS_ON_TOUR_STEPS: Record<HandsOnVariant, TourStep[]> = {
  simple: [
    { ...REQUEST_STEP, content: "実際の勤務時間は緑で表示します。" },
    { ...SET_WORK_TIME_STEP, placement: "bottom" },
    {
      target: rowOf(BREAK_STAFF_ID),
      // 範囲を選ぶと、選んだ範囲の下にメニューが開く。メニューと重ならないよう、行の右端の下に出す。
      placement: "bottom-end",
      title: "休憩を入れる",
      content: "渡辺さんの勤務の12時から13時をドラッグして、「休憩」を選びましょう。",
    },
    CONFIRM_STEP,
  ],
  // くわしく表示では、はじめは勤務がなく希望の点線の枠だけが並ぶため、色の付いたバーには触れない。
  detail: [
    { ...REQUEST_STEP, placement: "top", content: "スタッフが出した希望の時間です。" },
    { ...SET_WORK_TIME_STEP, placement: "top" },
    {
      target: rowOf(SATO_STAFF_ID),
      placement: "top",
      title: "ポジションを変える",
      content: "入れた勤務の19時から22時をドラッグして、「キッチン」を選びましょう。",
    },
    {
      target: '[data-tour="auto-create-button"]',
      placement: "bottom-end",
      title: "自動で作る",
      content: "「自動作成」を押すと、希望と必要人数から下書きを作れます。",
    },
    CONFIRM_STEP,
  ],
};

export const HANDS_ON_TODO_LABELS: Record<HandsOnVariant, string[]> = {
  simple: ["希望を確かめる", "勤務時間を設定する", "休憩を入れる", "確定する"],
  detail: ["希望を確かめる", "勤務時間を設定する", "ポジションを変える", "自動で作る", "確定する"],
};
