import { describe, expect, it } from "vitest";
import type { ShiftData } from "@/src/domains/shift/types";
import {
  getHandsOnChapter,
  HANDS_ON_SCENE_DURATIONS,
  type HandsOnFlowEvent,
  type HandsOnFlowState,
  type HandsOnScene,
  initialHandsOnFlowState,
  reduceHandsOnFlow,
} from "./flow";

const at = (scene: HandsOnScene, extra: Partial<HandsOnFlowState> = {}): HandsOnFlowState => ({
  ...initialHandsOnFlowState,
  scene,
  ...extra,
});

const run = (state: HandsOnFlowState, ...events: HandsOnFlowEvent[]) => events.reduce(reduceHandsOnFlow, state);

const confirmedShifts: ShiftData[] = [
  {
    id: "shift-s9-2026-11-30",
    staffId: "s9",
    staffName: "佐藤 大輔",
    date: "2026-11-30",
    requestedTime: null,
    positions: [],
  },
];

describe("体験デモの場面の流れ", () => {
  it("募集を開始すると、送る場面からスタッフの提出まで決まった時間で進み、提出の知らせでシフト表の手前まで進む", () => {
    const state = run(
      initialHandsOnFlowState,
      { type: "start" },
      { type: "advance", from: "sent" },
      { type: "advance", from: "staffMessage" },
      { type: "staffSubmitted" },
    );
    expect(state.scene).toBe("collected");
    expect(run(state, { type: "advance", from: "collected" }).scene).toBe("board");
  });

  it("スタッフの提出の知らせが来なくても、決まった時間で希望が届く場面へ進む", () => {
    expect(run(at("staffAnswer"), { type: "advance", from: "staffAnswer" }).scene).toBe("collected");
  });

  it("場面が変わったあとに届いた古い時間切れは無視する", () => {
    expect(run(at("staffMessage"), { type: "advance", from: "sent" })).toEqual(at("staffMessage"));
  });

  it("スタッフの提出の知らせは、スタッフが希望を出す場面でだけ受け付ける", () => {
    expect(run(at("staffMessage"), { type: "staffSubmitted" })).toEqual(at("staffMessage"));
  });

  it("シフト表で確定すると、その時の下書きを持って送る場面へ進み、お知らせを経て完成の画面で止まる", () => {
    const sent = run(at("board"), { type: "confirm", shifts: confirmedShifts });
    expect(sent).toEqual(at("confirmSent", { confirmedShifts }));

    const praise = run(sent, { type: "advance", from: "confirmSent" }, { type: "advance", from: "confirmMessage" });
    expect(praise.scene).toBe("praise");
    expect(run(praise, { type: "advance", from: "praise" })).toEqual(praise);
  });

  it("シフト表のほかの場面では、確定を受け付けない", () => {
    expect(run(at("collected"), { type: "confirm", shifts: confirmedShifts })).toEqual(at("collected"));
  });

  it("最初からやり直すと、確定した下書きを捨てて始まりへ戻り、作り直しの番号を増やす", () => {
    expect(run(at("praise", { confirmedShifts, runId: 2 }), { type: "reset" })).toEqual({
      scene: "start",
      confirmedShifts: null,
      runId: 3,
    });
  });

  it("始まり、シフト表、完成の画面は、利用者の操作を待ち、時間では進めない", () => {
    expect(HANDS_ON_SCENE_DURATIONS.start).toBeUndefined();
    expect(HANDS_ON_SCENE_DURATIONS.board).toBeUndefined();
    expect(HANDS_ON_SCENE_DURATIONS.praise).toBeUndefined();
  });
});

describe("上の段の手順", () => {
  it.each([
    ["start", 1],
    ["sent", 1],
    ["staffMessage", 1],
    ["staffAnswer", 1],
    ["collected", 1],
    ["board", 2],
    ["confirmSent", 3],
    ["confirmMessage", 3],
    ["praise", 4],
  ] as const)("%sは%iにする", (scene, chapter) => {
    expect(getHandsOnChapter(scene)).toBe(chapter);
  });
});
