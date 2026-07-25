import { interpolate } from "remotion";
import { clamp01 } from "../../animation";
import { COLORS } from "../../theme";

const STAFF = ["田中", "佐藤", "鈴木", "高橋"];
const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

/** 誰がどの曜日に入るか。埋まる順番＝アニメーションの順番。 */
const ASSIGNMENTS: ReadonlyArray<readonly [row: number, column: number]> = [
  [0, 0],
  [1, 1],
  [2, 0],
  [0, 2],
  [3, 3],
  [1, 4],
  [2, 5],
  [0, 5],
  [3, 6],
  [1, 6],
];

type Props = {
  /** 0→1 でマスが順に埋まる */
  progress: number;
  cellWidth?: number;
  cellHeight?: number;
  gap?: number;
};

export const ShiftBoard = ({ progress, cellWidth = 56, cellHeight = 40, gap = 8 }: Props) => {
  const revealed = clamp01(progress) * ASSIGNMENTS.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <div style={{ display: "grid", gridTemplateColumns: `72px repeat(7, ${cellWidth}px)`, gap }}>
        <div />
        {DAYS.map((day) => (
          <div key={day} style={{ textAlign: "center", fontSize: 22, fontWeight: 700, color: COLORS.inkMuted }}>
            {day}
          </div>
        ))}
      </div>

      {STAFF.map((name, row) => (
        <div key={name} style={{ display: "grid", gridTemplateColumns: `72px repeat(7, ${cellWidth}px)`, gap }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.inkSoft,
            }}
          >
            {name}
          </div>
          {DAYS.map((day, column) => {
            const order = ASSIGNMENTS.findIndex(([r, c]) => r === row && c === column);
            const fill =
              order === -1
                ? 0
                : interpolate(revealed, [order, order + 1], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  });

            return (
              <div
                key={day}
                style={{
                  height: cellHeight,
                  borderRadius: 10,
                  backgroundColor: fill > 0 ? COLORS.teal : COLORS.surface,
                  border: `2px solid ${fill > 0 ? COLORS.teal : COLORS.line}`,
                  opacity: fill > 0 ? 0.3 + fill * 0.7 : 1,
                  transform: `scale(${0.9 + fill * 0.1})`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};
