import { useCurrentFrame } from "remotion";
import { Laptop } from "../components/Devices";
import { DashboardScreen, ShiftBoardScreen, shiftCellPoint } from "../components/PcScreens";
import { Cursor, type PathKey } from "../components/Pointer";
import { Scene } from "../components/Scene";
import { Telop } from "../components/Telop";
import { TELOP } from "../copy";
import { PC_MAIN, pcPoint } from "../layout";
import { type CameraKey, cameraStyle, EASE, FULL_VIEW, fadeOut, progress } from "../motion";
import { FINAL_SUBMITTED_AT } from "./S4Collect";

export const ASSIGNMENTS = [
  { row: 0, column: 1, at: 36 },
  { row: 0, column: 2, at: 52 },
  { row: 0, column: 5, at: 68 },
  { row: 1, column: 0, at: 84 },
  { row: 2, column: 4, at: 100 },
  // 2つ目の字幕の間も、割り当てを続けて調整している様子を見せる
  { row: 3, column: 2, at: 120 },
  { row: 4, column: 0, at: 140 },
  { row: 3, column: 6, at: 160 },
] as const;

const lastAssignment = ASSIGNMENTS[ASSIGNMENTS.length - 1];
// カーソルで希望の時間帯を隠さないよう、セルの右下寄りを押す
const CLICK_OFFSET = { x: 30, y: 12 } as const;
const cellClickPoint = (row: number, column: number) => {
  const point = pcPoint(shiftCellPoint(row, column));
  return { x: point.x + CLICK_OFFSET.x, y: point.y + CLICK_OFFSET.y };
};
export const LAST_CELL = cellClickPoint(lastAssignment.row, lastAssignment.column);

const first = cellClickPoint(ASSIGNMENTS[0].row, ASSIGNMENTS[0].column);
const CURSOR_KEYS: PathKey[] = [
  { frame: 24, x: first.x + 160, y: first.y + 120 },
  ...ASSIGNMENTS.flatMap(({ row, column, at }) => {
    const point = cellClickPoint(row, column);
    return [
      { frame: at, ...point },
      { frame: at + 4, ...point },
    ];
  }),
];

const CAMERA: CameraKey[] = [
  { frame: 0, ...FULL_VIEW },
  { frame: 24, scale: 1.6, x: 700, y: 600 },
  { frame: 186, scale: 1.6, x: 725, y: 600 },
  { frame: 209, scale: 1.9, x: 1000, y: 470 },
];

/** S5 ② 希望を見ながらシフトを組む（7秒） */
export const S5Build = () => {
  const frame = useCurrentFrame();
  return (
    <Scene>
      <div style={cameraStyle(frame, CAMERA)}>
        <Laptop {...PC_MAIN}>
          <div style={{ position: "absolute", inset: 0, opacity: fadeOut(frame, 0, 8) }}>
            <DashboardScreen submittedAt={FINAL_SUBMITTED_AT} />
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: progress(frame, 6, 10, EASE.enter) }}>
            <ShiftBoardScreen assigned={[...ASSIGNMENTS]} />
          </div>
        </Laptop>
        <Cursor keys={CURSOR_KEYS} clicks={ASSIGNMENTS.map(({ at }) => at)} start={24} />
      </div>
      <Telop step={2} text={TELOP.build} start={0} end={100} />
      <Telop text={TELOP.adjust} start={104} end={202} />
    </Scene>
  );
};
