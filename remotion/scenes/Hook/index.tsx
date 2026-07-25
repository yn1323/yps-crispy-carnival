import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { riseIn, useBreath, useSpringIn } from "../../animation";
import { ChatBubble } from "../../components/ChatBubble";
import { Screen } from "../../components/Screen";
import { COLORS } from "../../theme";

type Message = {
  text: string;
  tone: "line" | "plain";
  tail: "left" | "right";
  left: number;
  top: number;
  width: number;
  rotate: number;
  from: { x: number; y: number };
  delay: number;
};

/** 散らかった希望シフトのやり取り。バラバラさを角度と位置で見せる。 */
const MESSAGES: Message[] = [
  {
    text: "来月のシフト、いつまでですか？",
    tone: "plain",
    tail: "left",
    left: 90,
    top: 104,
    width: 420,
    rotate: -4,
    from: { x: -220, y: -60 },
    delay: 0,
  },
  {
    text: "土日は入れます！",
    tone: "line",
    tail: "left",
    left: 720,
    top: 40,
    width: 330,
    rotate: 3,
    from: { x: 0, y: -200 },
    delay: 7,
  },
  {
    text: "5日と12日、休みたいです",
    tone: "plain",
    tail: "right",
    left: 1400,
    top: 148,
    width: 430,
    rotate: -3,
    from: { x: 240, y: -80 },
    delay: 14,
  },
  {
    text: "早番でお願いします",
    tone: "line",
    tail: "left",
    left: 118,
    top: 806,
    width: 360,
    rotate: 4,
    from: { x: -230, y: 90 },
    delay: 21,
  },
  {
    text: "すみません、まだ出せてません…",
    tone: "plain",
    tail: "left",
    left: 690,
    top: 878,
    width: 490,
    rotate: -2,
    from: { x: 0, y: 210 },
    delay: 28,
  },
  {
    text: "シフトまだ？",
    tone: "plain",
    tail: "right",
    left: 1382,
    top: 792,
    width: 320,
    rotate: 5,
    from: { x: 250, y: 110 },
    delay: 35,
  },
];

export const HookScene = () => {
  const frame = useCurrentFrame();
  const scrim = interpolate(frame, [44, 68], [0, 0.88], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const line1 = useSpringIn(52);
  const line2 = useSpringIn(66);

  return (
    <Screen decorated={false}>
      {MESSAGES.map((message) => (
        <FloatingMessage key={message.text} message={message} />
      ))}

      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 62% 46% at 50% 50%, rgba(255,255,255,${scrim}) 0%, rgba(255,255,255,${scrim * 0.9}) 55%, rgba(255,255,255,0) 100%)`,
        }}
      />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div style={{ ...riseIn(line1, 24), fontSize: 84, fontWeight: 800 }}>毎月のシフト集め、</div>
          <div style={{ ...riseIn(line2, 24), fontSize: 100, fontWeight: 800, marginTop: 12 }}>
            まだ<span style={{ color: COLORS.teal }}>手作業</span>ですか？
          </div>
        </div>
      </AbsoluteFill>
    </Screen>
  );
};

const FloatingMessage = ({ message }: { message: Message }) => {
  const enter = useSpringIn(message.delay, 30);
  const drift = useBreath(96, 6, message.delay);

  return (
    <div
      style={{
        position: "absolute",
        left: message.left,
        top: message.top,
        opacity: enter,
        transform: [
          `translate(${(1 - enter) * message.from.x}px, ${(1 - enter) * message.from.y + drift}px)`,
          `rotate(${message.rotate * enter}deg)`,
        ].join(" "),
      }}
    >
      <ChatBubble text={message.text} tone={message.tone} tail={message.tail} width={message.width} />
    </div>
  );
};
