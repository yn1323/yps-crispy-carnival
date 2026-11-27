// 体験デモの場面の流れ。送る場面とお知らせは決まった時間で次へ進み、シフト表と完成の画面は利用者の操作を待つ。
import type { ShiftData } from "@/src/domains/shift/types";

export type HandsOnScene =
  | "start"
  | "sent"
  | "staffMessage"
  | "staffAnswer"
  | "collected"
  | "board"
  | "confirmSent"
  | "confirmMessage"
  | "praise";

export type HandsOnFlowState = {
  scene: HandsOnScene;
  /** 確定したときの下書き。届いたお知らせに並べる。 */
  confirmedShifts: ShiftData[] | null;
  /** 最初からやり直すたびに増やし、シフト表を作り直す。 */
  runId: number;
};

export type HandsOnFlowEvent =
  | { type: "start" }
  /** 決まった時間がたった。`from`の場面のままのときだけ進める。 */
  | { type: "advance"; from: HandsOnScene }
  | { type: "staffSubmitted" }
  | { type: "confirm"; shifts: ShiftData[] }
  | { type: "reset" };

/** 決まった時間で次へ進む場面と、その時間（ミリ秒）。スタッフの提出は終わりの知らせを待ち、来なければこの時間で進める。 */
export const HANDS_ON_SCENE_DURATIONS: Partial<Record<HandsOnScene, number>> = {
  sent: 3400,
  staffMessage: 3600,
  staffAnswer: 45000,
  collected: 3400,
  confirmSent: 3400,
  confirmMessage: 5000,
};

const NEXT_SCENE: Partial<Record<HandsOnScene, HandsOnScene>> = {
  sent: "staffMessage",
  staffMessage: "staffAnswer",
  staffAnswer: "collected",
  collected: "board",
  confirmSent: "confirmMessage",
  confirmMessage: "praise",
};

export const initialHandsOnFlowState: HandsOnFlowState = { scene: "start", confirmedShifts: null, runId: 0 };

export const reduceHandsOnFlow = (state: HandsOnFlowState, event: HandsOnFlowEvent): HandsOnFlowState => {
  switch (event.type) {
    case "start":
      return state.scene === "start" ? { ...state, scene: "sent" } : state;
    case "advance": {
      if (state.scene !== event.from) return state;
      const next = NEXT_SCENE[state.scene];
      return next ? { ...state, scene: next } : state;
    }
    case "staffSubmitted":
      return state.scene === "staffAnswer" ? { ...state, scene: "collected" } : state;
    case "confirm":
      return state.scene === "board" ? { ...state, scene: "confirmSent", confirmedShifts: event.shifts } : state;
    case "reset":
      return { ...initialHandsOnFlowState, runId: state.runId + 1 };
  }
};

/** 上の段の手順で、いま進めている番号。完成の画面では、すべてを終えた4を返す。 */
export const getHandsOnChapter = (scene: HandsOnScene): 1 | 2 | 3 | 4 => {
  switch (scene) {
    case "start":
    case "sent":
    case "staffMessage":
    case "staffAnswer":
    case "collected":
      return 1;
    case "board":
      return 2;
    case "confirmSent":
    case "confirmMessage":
      return 3;
    case "praise":
      return 4;
  }
};
