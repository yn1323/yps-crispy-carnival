import { ClientOnly } from "@tanstack/react-router";
import { type Dispatch, useCallback, useEffect, useMemo, useReducer } from "react";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import type { ShiftData } from "@/src/domains/shift/types";
import { BoardStep } from "./BoardStep";
import {
  getHandsOnChapter,
  HANDS_ON_SCENE_DURATIONS,
  type HandsOnFlowEvent,
  type HandsOnFlowState,
  initialHandsOnFlowState,
  reduceHandsOnFlow,
} from "./flow";
import { HandsOnShell } from "./HandsOnShell";
import { PraiseScene } from "./PraiseScene";
import { buildConfirmRows, type HandsOnVariant } from "./progress";
import { isSendScene, SendModal } from "./SendModal";
import { StartScene } from "./StartScene";
import {
  buildHandsOnScenario,
  getHandsOnPeriodStart,
  HANDS_ON_SHOP_NAME,
  SATO_STAFF_ID,
  SATO_STAFF_NAME,
} from "./scenario";

export type { HandsOnVariant } from "./progress";
export { HandsOnStaffSubmitDemo } from "./StaffSubmitDemo";

type ScenesProps = {
  variant: HandsOnVariant;
  periodStart: string;
  state: HandsOnFlowState;
  dispatch: Dispatch<HandsOnFlowEvent>;
};

/** 場面を重ねて描く。送る場面の後ろには、その前の画面（募集を開始する画面か、シフト表）を残す。 */
const HandsOnScenes = ({ variant, periodStart, state, dispatch }: ScenesProps) => {
  const scenario = useMemo(() => buildHandsOnScenario(periodStart), [periodStart]);
  const { scene } = state;
  const showsBoard = scene === "board" || scene === "confirmSent" || scene === "confirmMessage" || scene === "praise";
  const confirmRows = useMemo(
    () => buildConfirmRows(state.confirmedShifts ?? [], SATO_STAFF_ID, scenario.dates),
    [state.confirmedShifts, scenario.dates],
  );
  const handleStart = useCallback(() => dispatch({ type: "start" }), [dispatch]);
  const handleStaffSubmitted = useCallback(() => dispatch({ type: "staffSubmitted" }), [dispatch]);
  const handleConfirm = useCallback((shifts: ShiftData[]) => dispatch({ type: "confirm", shifts }), [dispatch]);

  return (
    <>
      {showsBoard ? (
        <BoardStep
          variant={variant}
          scenario={scenario}
          arrives
          isBackdrop={scene !== "board"}
          onConfirm={handleConfirm}
        />
      ) : (
        <StartScene label={scenario.startLabel} isActive={scene === "start"} onStart={handleStart} />
      )}
      {isSendScene(scene) && (
        <SendModal
          scene={scene}
          shopName={HANDS_ON_SHOP_NAME}
          staffName={SATO_STAFF_NAME}
          periodLabel={scenario.periodLabel}
          deadlineLabel={`${formatDateWithWeekday(scenario.deadline)} 23:59`}
          periodStart={periodStart}
          confirmRows={confirmRows}
          onStaffSubmitted={handleStaffSubmitted}
        />
      )}
      {scene === "praise" && <PraiseScene />}
    </>
  );
};

type Props = {
  variant: HandsOnVariant;
  /** 募集の初日（YYYY-MM-DD）。省略すると、開いた日の次の月曜にする。Storyで日付を固定するときに渡す。 */
  periodStart?: string;
};

/**
 * 体験デモ「シフトを作ってみよう！」。募集を開始し、スタッフが希望を出し、シフト表で勤務を入れて確定し、
 * スタッフにシフトが届くまでを、本物の画面の部品で試せる。保存も通知もしない。
 */
export const HandsOnDemo = ({ variant, periodStart }: Props) => {
  const [state, dispatch] = useReducer(reduceHandsOnFlow, initialHandsOnFlowState);

  useEffect(() => {
    const duration = HANDS_ON_SCENE_DURATIONS[state.scene];
    if (duration === undefined) return;
    const timer = window.setTimeout(() => dispatch({ type: "advance", from: state.scene }), duration);
    return () => window.clearTimeout(timer);
  }, [state.scene]);

  const handleReset = useCallback(() => dispatch({ type: "reset" }), []);

  return (
    <HandsOnShell chapter={getHandsOnChapter(state.scene)} onReset={handleReset}>
      {/* 募集の日付は開いた日で決まるため、ブラウザで描く。 */}
      <ClientOnly fallback={null}>
        <HandsOnScenes
          key={state.runId}
          variant={variant}
          periodStart={periodStart ?? getHandsOnPeriodStart()}
          state={state}
          dispatch={dispatch}
        />
      </ClientOnly>
    </HandsOnShell>
  );
};
