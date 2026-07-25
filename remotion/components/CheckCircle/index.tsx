import { interpolate } from "remotion";
import { clamp01 } from "../../animation";
import { COLORS } from "../../theme";

type Props = {
  /** 0→1 で丸が広がり、チェックが描かれる */
  progress: number;
  size?: number;
  color?: string;
};

/** 「決まった」「送られた」を表す記号。線が描かれる動きで完了感を出す。 */
export const CheckCircle = ({ progress, size = 96, color = COLORS.teal }: Props) => {
  const p = clamp01(progress);
  const circle = interpolate(p, [0, 0.45], [0, 1], { extrapolateRight: "clamp" });
  const stroke = interpolate(p, [0.35, 1], [0, 1], { extrapolateLeft: "clamp" });
  const dash = 36;

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="21"
        fill={color}
        style={{ transformOrigin: "center", transform: `scale(${circle})`, opacity: circle }}
      />
      <path
        d="M15 24.5 21.5 31 34 18"
        stroke={COLORS.bg}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
        strokeDashoffset={dash * (1 - stroke)}
      />
    </svg>
  );
};
