import { useCurrentFrame } from "remotion";
import { Phone } from "../components/Devices";
import { Illustration } from "../components/People";
import { ChatScreen } from "../components/PhoneScreens";
import { Scene } from "../components/Scene";
import { Chip } from "../components/Telop";
import { CHAT, STAFF, TELOP } from "../copy";
import { appear, EASE, fadeOut, type Point, progress } from "../motion";
import { COLORS } from "../theme";

const CHIP_AT = [6, 48, 90] as const;

// 字幕帯に横一列で並べたときの中心（文字72px）
const ROW_CHIPS: Point[] = [
  { x: 394, y: 168 },
  { x: 888, y: 168 },
  { x: 1454, y: 168 },
];
const ROW_ARROWS: Point[] = [
  { x: 677, y: 168 },
  { x: 1099, y: 168 },
];
// 画面中央に縦3段で並べ直したときの中心（1.5倍）
const STACK_CHIPS: Point[] = [
  { x: 960, y: 290 },
  { x: 960, y: 540 },
  { x: 960, y: 790 },
];
const STACK_ARROWS: Point[] = [
  { x: 960, y: 415 },
  { x: 960, y: 665 },
];
const STACK_SCALE = 1.5;
const CENTER: Point = { x: 960, y: 540 };

const lerpPoint = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

/** S1 今のやり取り（7秒）。最後に3つのバッジを画面中央へ大きく並べ直す */
export const S1Chaos = () => {
  const frame = useCurrentFrame();
  const stack = progress(frame, 150, 24, EASE.move);
  const collapse = progress(frame, 196, 14, EASE.exit);
  const shake = frame >= 44 && frame <= 56 ? Math.sin(((frame - 44) / 12) * Math.PI * 4) * 1.2 : 0;
  const leave = { opacity: fadeOut(frame, 150, 12), scale: String(1 - 0.04 * progress(frame, 150, 12, EASE.exit)) };
  const phoneIn = progress(frame, -4, 12, EASE.enter);
  const chips = [TELOP.collect, TELOP.remind, TELOP.send];
  const placement = (row: Point, stacked: Point) => {
    const point = lerpPoint(lerpPoint(row, stacked, stack), CENTER, collapse);
    const scale = (1 + (STACK_SCALE - 1) * stack) * (1 - 0.7 * collapse);
    return {
      position: "absolute",
      left: point.x,
      top: point.y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity: 1 - collapse,
    } as const;
  };
  return (
    <Scene>
      <div style={{ ...leave, position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", inset: 0, rotate: `${shake}deg`, transformOrigin: "700px 1000px" }}>
          <Illustration
            file="manager-troubled.png"
            x={330}
            y={280}
            width={740}
            height={740}
            style={appear(frame, -8)}
          />
        </div>
        <Phone x={1120} y={300} style={{ opacity: phoneIn, translate: `${(1 - phoneIn) * 80}px 0px` }}>
          <ChatScreen
            messages={[
              { kind: "other", person: "saki", name: STAFF[0].name, text: CHAT.messages[0], at: 6 },
              { kind: "other", person: "haruto", name: STAFF[1].name, text: CHAT.messages[1], at: 14 },
              { kind: "other", person: "mio", name: STAFF[2].name, text: CHAT.messages[2], at: 22 },
              { kind: "self", text: CHAT.managerMessage, at: 44 },
              { kind: "image", at: 86 },
            ]}
          />
        </Phone>
      </div>
      {ROW_ARROWS.map((row, index) => (
        <div key={row.x} style={placement(row, STACK_ARROWS[index])}>
          <div
            style={{
              fontSize: 72,
              lineHeight: 1,
              color: COLORS.subtle,
              rotate: `${90 * stack}deg`,
              ...appear(frame, CHIP_AT[index + 1]),
            }}
          >
            ›
          </div>
        </div>
      ))}
      {chips.map((text, index) => (
        <div key={text} style={placement(ROW_CHIPS[index], STACK_CHIPS[index])}>
          <Chip text={text} style={appear(frame, CHIP_AT[index])} />
        </div>
      ))}
    </Scene>
  );
};
