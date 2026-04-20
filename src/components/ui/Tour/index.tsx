import { type EventData, Joyride, type Options, type Step } from "react-joyride";
import { TourTooltip } from "./TourTooltip";

export type { EventData };

/**
 * 任意のメタデータを `data` に付けられる `Step` 型。
 * イベントハンドラ内で step.data を型安全に取り出すのに使う。
 */
export type TourStep<TData = unknown> = Omit<Step, "data"> & { data?: TData };

type Props = {
  run: boolean;
  steps: TourStep[];
  onEvent?: (data: EventData) => void;
  /** 既定のオプション（skipBeacon 等）を個別に上書きしたいときに使う */
  options?: Partial<Options>;
};

const DEFAULT_OPTIONS: Partial<Options> = {
  skipBeacon: true,
  skipScroll: true,
  overlayClickAction: false,
  overlayColor: "rgba(0, 0, 0, 0.55)",
  zIndex: 10000,
  arrowColor: "#ffffff",
  spotlightRadius: 8,
};

export const Tour = ({ run, steps, onEvent, options }: Props) => (
  <Joyride
    run={run}
    steps={steps}
    continuous
    tooltipComponent={TourTooltip}
    onEvent={onEvent}
    options={{ ...DEFAULT_OPTIONS, ...options }}
  />
);
