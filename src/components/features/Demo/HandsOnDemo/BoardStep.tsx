import { Box, useBreakpointValue } from "@chakra-ui/react";
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ShiftForm, type ShiftFormDetailActions } from "@/src/components/features/Shift/ShiftForm";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { Tour, type TourHandle } from "@/src/components/ui/Tour";
import type { ShiftData } from "@/src/domains/shift/types";
import { HandsOnTourNextContext, HandsOnTourTooltip } from "./HandsOnTourTooltip";
import { getHandsOnStepIndex, type HandsOnVariant } from "./progress";
import {
  HANDS_ON_POSITIONS,
  HANDS_ON_SUBMISSION_PATTERN,
  HANDS_ON_TIME_RANGE,
  type HandsOnScenario,
  runHandsOnAutoCreate,
} from "./scenario";
import { TodoCard } from "./TodoCard";
import { HANDS_ON_TODO_LABELS, HANDS_ON_TOUR_STEPS } from "./tourSteps";

/**
 * 吹き出しの重なり順。範囲を選んだときのメニュー（Chakraのdropdown、1000）、自動作成と休憩のダイアログを、
 * 暗くした面と吹き出しの上に出すため、それより下にする。
 */
const TOUR_Z_INDEX = 900;
const TODO_Z_INDEX = TOUR_Z_INDEX + 1;

/** 希望が届いた直後に、行ごとに順に並べる動き。1行ずつずらして、左から滑り込ませる。 */
const ARRIVE_START_S = 0.4;
const ARRIVE_STEP_S = 0.16;
const ARRIVE_DURATION_S = 0.55;

/**
 * 届いた希望を並べる動き。並べ終えたら外し、そのあとドラッグで出す範囲の表示には動きを付けない。
 * 外さないと、ドラッグ中の範囲の表示まで、行ごとにずらした時間だけ見えなくなる。
 */
const buildArriveCss = (staffIds: string[]) =>
  staffIds
    .map(
      (staffId, index) =>
        // 行の2つ目の子が時間の欄で、その中の2つ目以降が希望の枠と勤務のバーである。
        `[data-tour="shift-row-${staffId}"] > :nth-child(2) > :nth-child(n+2) { animation: hodArrive ${ARRIVE_DURATION_S}s cubic-bezier(.2,.8,.2,1) ${(ARRIVE_START_S + index * ARRIVE_STEP_S).toFixed(2)}s both; }`,
    )
    .join("\n");

const TOUR_DELAY_MS = 900;

/** 上の段の手順から、シフト表を操作する。 */
export type BoardStepHandle = {
  /** 「確定」を押したときと同じく、吹き出しを片付けてから、その時の下書きで確定する。 */
  confirm: () => void;
  /** シフト表を閉じる前に、吹き出しを片付ける。閉じるだけでは、吹き出しの部品がbodyに残ることがある。 */
  endTour: () => void;
};

type Props = {
  variant: HandsOnVariant;
  scenario: HandsOnScenario;
  /**
   * 手順を終えた下書き。シフト表を通らずに、上の段から「確定シフトを送る」へ移ったときに渡す。
   * 渡すと、届いた希望を並べる動きを出さず、案内も終えた状態から始める。開いたときの値だけを使う。
   */
  completedShifts?: ShiftData[];
  /** 確定したあとの場面の後ろに置いているか。吹き出しと「やること」を出さない。 */
  isBackdrop: boolean;
  onConfirm: (shifts: ShiftData[]) => void;
  handleRef?: Ref<BoardStepHandle>;
};

/** シフト表で、案内に沿って勤務を入れ、確定する。案内は、そのときの下書きから進める。 */
export const BoardStep = ({ variant, scenario, completedShifts, isBackdrop, onConfirm, handleRef }: Props) => {
  // 開いたときの値だけを使う。確定したあとも後ろに残し、上の段から戻ったときにそのまま続けられるよう、
  // あとで渡す値が変わっても下書きを作り直さない。
  const [start] = useState(() => ({
    shifts: completedShifts ?? (variant === "simple" ? scenario.simpleInitialShifts : scenario.requests),
    isCompleted: completedShifts !== undefined,
  }));
  const initialShifts = start.shifts;
  const arrives = !start.isCompleted;
  const day1 = scenario.dates[0];
  const [shifts, setShifts] = useState<ShiftData[]>(initialShifts);
  // 確定したときの下書きを、描き直しを待たずに渡すため、最後に届いた下書きも持っておく。
  const shiftsRef = useRef<ShiftData[]>(initialShifts);
  const [acknowledged, setAcknowledged] = useState(start.isCompleted);
  const [autoCreated, setAutoCreated] = useState(start.isCompleted);
  const applyShiftsRef = useRef<((update: (current: ShiftData[]) => ShiftData[]) => void) | null>(null);
  const tourRef = useRef<TourHandle>(null);
  // 吹き出しはPCだけに出す。スマートフォンでは右下の「やること」で進める。
  const isPc = useBreakpointValue({ base: false, lg: true }) ?? false;

  const arriveStaffIds = useMemo(
    () =>
      scenario.staffs
        .filter((staff) => initialShifts.some((shift) => shift.staffId === staff.id && shift.date === day1))
        .map((staff) => staff.id),
    [scenario.staffs, initialShifts, day1],
  );
  const arriveDoneMs = Math.round((ARRIVE_START_S + arriveStaffIds.length * ARRIVE_STEP_S + ARRIVE_DURATION_S) * 1000);

  const [isTourReady, setTourReady] = useState(false);
  const [isArriving, setArriving] = useState(arrives);
  useEffect(() => {
    const tourTimer = window.setTimeout(() => setTourReady(true), arrives ? arriveDoneMs + 300 : TOUR_DELAY_MS);
    const arriveTimer = arrives ? window.setTimeout(() => setArriving(false), arriveDoneMs) : undefined;
    return () => {
      window.clearTimeout(tourTimer);
      if (arriveTimer !== undefined) window.clearTimeout(arriveTimer);
    };
  }, [arrives, arriveDoneMs]);

  // スマートフォンには吹き出しがなく「次へ」を押せないため、希望を確かめる手順は済んだものとして進める。
  const stepIndex = getHandsOnStepIndex({ variant, shifts, day1, acknowledged: acknowledged || !isPc, autoCreated });

  const detailActions = useMemo<ShiftFormDetailActions>(
    () => ({
      // 体験デモはURLごとに表示を決めているため、表示設定で切り替えても変えない。
      requestDetailModeChange: () => {},
      ...(variant === "detail"
        ? {
            autoCreateAction: {
              onCreate: async (_method: "rule" | "ai", options: { includesBreaks: boolean }) => {
                applyShiftsRef.current?.((current) => runHandsOnAutoCreate(scenario, current, options.includesBreaks));
                showSuccessToast({ title: "シフトを自動作成しました" });
                setAutoCreated(true);
                return true;
              },
              isLoading: false,
              // 体験デモでは、AIの手直しは使えない状態で見せる。
              aiUnavailableReason: "notConfigured" as const,
            },
          }
        : {}),
    }),
    [variant, scenario],
  );

  const handleConfirm = useCallback(() => {
    // 吹き出しの部品を片付けてから、送る場面へ進める。
    tourRef.current?.skip();
    onConfirm(shiftsRef.current);
  }, [onConfirm]);

  useImperativeHandle(handleRef, () => ({ confirm: handleConfirm, endTour: () => tourRef.current?.skip() }), [
    handleConfirm,
  ]);

  const handleShiftsChange = useCallback((next: ShiftData[]) => {
    shiftsRef.current = next;
    setShifts(next);
  }, []);

  const handleSaveDraft = useCallback(() => {
    showSuccessToast({ title: "保存しました" });
  }, []);

  const acknowledge = useCallback(() => setAcknowledged(true), []);

  return (
    // 動きを終えたあとも残すと重なりの基準（stacking context）が残り、範囲を選んだときのメニューが吹き出しの暗い面の下に入る。
    // そのため、終えたあとは動きを残さない（backwards）。
    <Box h="full" style={{ animation: "hodSceneIn .4s ease-out backwards" }}>
      {isArriving && <style>{buildArriveCss(arriveStaffIds)}</style>}
      <ShiftForm
        shopId="hands-on-demo-shop"
        staffs={scenario.staffs}
        positions={HANDS_ON_POSITIONS}
        initialShifts={initialShifts}
        dates={scenario.dates}
        timeRange={HANDS_ON_TIME_RANGE}
        submissionPattern={HANDS_ON_SUBMISSION_PATTERN}
        staffing={variant === "detail" ? scenario.staffing : undefined}
        initialDetailMode={variant === "detail"}
        detailActions={detailActions}
        applyShiftsRef={applyShiftsRef}
        onShiftsChange={handleShiftsChange}
        onSaveDraft={handleSaveDraft}
        onConfirm={handleConfirm}
      />
      {!isBackdrop && (
        <TodoCard
          labels={HANDS_ON_TODO_LABELS[variant]}
          current={stepIndex}
          raised={variant === "detail"}
          zIndex={TODO_Z_INDEX}
        />
      )}
      {!isBackdrop && isPc && isTourReady && (
        <HandsOnTourNextContext.Provider value={acknowledge}>
          <Tour
            ref={tourRef}
            run
            steps={HANDS_ON_TOUR_STEPS[variant]}
            stepIndex={stepIndex}
            tooltipComponent={HandsOnTourTooltip}
            options={{ zIndex: TOUR_Z_INDEX }}
          />
        </HandsOnTourNextContext.Provider>
      )}
    </Box>
  );
};
