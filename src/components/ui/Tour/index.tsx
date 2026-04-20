import { forwardRef, useImperativeHandle } from "react";
import { type EventData, type Options, type Step, useJoyride } from "react-joyride";
import { TourTooltip } from "./TourTooltip";

export type { EventData };
export type TourStep = Step;

/** ref で公開する imperative API */
export type TourHandle = {
  /** ツアー全体を終了して overlay / portal を片付ける（公式: controls.skip）*/
  skip: () => void;
};

type Props = {
  run: boolean;
  steps: TourStep[];
  /** 外部からステップ進行を制御したいとき（controlled モード）に指定 */
  stepIndex?: number;
  onEvent?: (data: EventData) => void;
  /** 既定のオプション（skipBeacon 等）を個別に上書きしたいときに使う */
  options?: Partial<Options>;
};

const DEFAULT_OPTIONS: Partial<Options> = {
  skipBeacon: true,
  skipScroll: true,
  overlayClickAction: false,
  overlayColor: "rgba(0, 0, 0, 0.45)",
  zIndex: 10000,
  arrowColor: "#ffffff",
  spotlightRadius: 8,
};

/**
 * react-joyride v3 の `useJoyride` hook ベース実装。
 *
 * run=false や unmount に任せると `#react-joyride-portal` の DIV が body に
 * 残存する既知の挙動があるため、呼び出し側が ref.skip() で明示的に終了を
 * 宣言できるようにしている（公式推奨の `controls.skip()` を ref で露出）。
 */
export const Tour = forwardRef<TourHandle, Props>(({ run, steps, stepIndex, onEvent, options }, ref) => {
  const { controls, Tour: JoyrideTour } = useJoyride({
    steps,
    run,
    stepIndex,
    continuous: true,
    tooltipComponent: TourTooltip,
    onEvent,
    options: { ...DEFAULT_OPTIONS, ...options },
  });

  useImperativeHandle(ref, () => ({ skip: controls.skip }), [controls]);

  return JoyrideTour;
});

Tour.displayName = "Tour";
