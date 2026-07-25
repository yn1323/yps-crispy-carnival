import { interpolate } from "remotion";
import { clamp01 } from "../../animation";
import { COLORS } from "../../theme";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

type Props = {
  days?: number;
  /** 0-indexed。この範囲が「募集期間」として teal に染まる */
  rangeStart?: number;
  rangeEnd?: number;
  /** 0→1 で範囲が左から順に染まる */
  progress: number;
  cellSize?: number;
  gap?: number;
};

export const CalendarGrid = ({
  days = 28,
  rangeStart = 6,
  rangeEnd = 19,
  progress,
  cellSize = 52,
  gap = 10,
}: Props) => {
  const p = clamp01(progress);
  const rangeLength = rangeEnd - rangeStart + 1;
  const revealed = p * rangeLength;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${cellSize}px)`, gap }}>
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            style={{
              textAlign: "center",
              fontSize: cellSize * 0.34,
              fontWeight: 700,
              color: COLORS.inkMuted,
            }}
          >
            {weekday}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${cellSize}px)`, gap }}>
        {Array.from({ length: days }, (_, index) => {
          const inRange = index >= rangeStart && index <= rangeEnd;
          const fill = inRange
            ? interpolate(revealed, [index - rangeStart, index - rangeStart + 1], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 0;

          return (
            <div
              key={index}
              style={{
                width: cellSize,
                height: cellSize,
                borderRadius: cellSize * 0.28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: cellSize * 0.36,
                fontWeight: 700,
                backgroundColor: fill > 0 ? COLORS.teal : COLORS.surface,
                border: `2px solid ${fill > 0 ? COLORS.teal : COLORS.line}`,
                color: fill > 0 ? COLORS.bg : COLORS.inkMuted,
                opacity: fill > 0 ? 0.35 + fill * 0.65 : 1,
                transform: `scale(${0.94 + fill * 0.06})`,
              }}
            >
              {index + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
};
