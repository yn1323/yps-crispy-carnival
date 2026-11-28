// シフト表の吹き出しと、右下の「やること」の文言。手順の番号はprogress.tsの判定と同じ並びにする。
import type { TourStep } from "@/src/components/ui/Tour";
import type { HandsOnVariant } from "./progress";
import { BREAK_STAFF_ID, HANDS_ON_KITCHEN_ID, HANDS_ON_POSITIONS, SATO_STAFF_ID } from "./scenario";

/**
 * showsNext：吹き出しに「次へ」を出す。読むだけで、進める操作がない手順に付ける。
 * story：人のアイコンを添えて、話の流れとして見せる。
 */
export type HandsOnTourStepData = { showsNext?: boolean; story?: boolean };

/**
 * 吹き出しの重なり順。範囲を選んだときのメニュー（Chakraのdropdown、1000）、自動作成と休憩のダイアログを、
 * 暗くした面と吹き出しの上に出すため、それより下にする。
 */
export const HANDS_ON_TOUR_Z_INDEX = 900;

const rowOf = (staffId: string) => `[data-tour="shift-row-${staffId}"]`;

/** くわしく表示の右上で、ドラッグで入れるポジションを選ぶボタンのうち、ホール。 */
export const HANDS_ON_HALL_CHIP = `[data-tour="range-position-${HANDS_ON_POSITIONS[0].id}"]`;
/** 勤務の範囲をドラッグしたときに開くメニューの、キッチンの項目。 */
export const HANDS_ON_KITCHEN_MENU_ITEM = `[data-scope="menu"][data-part="item"][data-value="position:${HANDS_ON_KITCHEN_ID}"]`;

/** 佐藤さんの行に、人のアイコンを添えて話を出す手順。 */
const storyStep = (content: string): TourStep => ({
  target: rowOf(SATO_STAFF_ID),
  placement: "bottom",
  content,
  data: { showsNext: true, story: true } satisfies HandsOnTourStepData,
});

const REQUEST_STEP = {
  target: rowOf(SATO_STAFF_ID),
  placement: "bottom",
  title: "点線が希望シフトです",
  data: { showsNext: true } satisfies HandsOnTourStepData,
} as const;

const SET_WORK_TIME_STEP = {
  target: rowOf(SATO_STAFF_ID),
  title: "勤務時間を設定しましょう",
  content: "点線にそって17時〜22時をドラッグしてみましょう。",
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
  // くわしく表示もシンプル表示の最初の吹き出しにそろえる。勤務のバーはポジションの色で描くため、緑とは書かない。
  // そのあとは、佐藤さんにホールを任せ、途中をキッチンに変える話に沿って進める。
  detail: [
    { ...REQUEST_STEP, content: "実際の勤務時間はポジションの色で表示します。" },
    storyStep("佐藤さんに17時〜22時にホールを担当してもらいます。"),
    { target: HANDS_ON_HALL_CHIP, placement: "bottom-end", content: "右上のホールを押しましょう" },
    { target: rowOf(SATO_STAFF_ID), placement: "bottom", content: "17時〜22時をドラッグしましょう" },
    storyStep("やっぱり18時〜20時はキッチンを担当してもらいましょう。"),
    { target: rowOf(SATO_STAFF_ID), placement: "bottom", content: "18時〜20時をドラッグしましょう" },
    // 範囲のメニューは選んだ範囲の下に開く。メニューと重ならないよう、項目の左に出す。
    { target: HANDS_ON_KITCHEN_MENU_ITEM, placement: "left", content: "キッチンを選択しましょう" },
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

/** 吹き出しの手順の番号ごとに、「やること」のどの項目にあたるか。くわしく表示は、いくつかの吹き出しで1つの項目を進める。 */
export const HANDS_ON_TODO_INDEX: Record<HandsOnVariant, number[]> = {
  simple: [0, 1, 2, 3],
  detail: [0, 1, 1, 1, 2, 2, 2, 3, 4],
};
