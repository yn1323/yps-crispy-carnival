import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { popIn, riseIn, useBounceIn, useLoop, useSpringIn } from "../../animation";
import { IconBell, IconCalendar, IconChat, IconCheck, IconCross, IconMail } from "../../components/Icons";
import { Screen } from "../../components/Screen";
import { COLORS, SHADOW } from "../../theme";

const PAINS = [
  {
    title: "バラバラに届く",
    body: "LINE、口頭、紙のメモ。\n集めるだけでひと苦労。",
  },
  {
    title: "ひとりずつ催促",
    body: "「シフトまだ？」を毎月、\n未提出の人に個別に連絡。",
  },
  {
    title: "見たか分からない",
    body: "共有したはずのシフトが、\n当日「見てなかった」に。",
  },
] as const;

export const PainScene = () => {
  const title = useSpringIn(0);
  const closing = useSpringIn(178);

  return (
    <Screen>
      <AbsoluteFill style={{ padding: "104px 120px", flexDirection: "column", alignItems: "center" }}>
        <h1 style={{ ...riseIn(title, 24), margin: 0, fontSize: 68, fontWeight: 800, textAlign: "center" }}>
          シフト作りが、いつまでも終わらない
        </h1>

        <div style={{ display: "flex", gap: 56, marginTop: 76 }}>
          {PAINS.map((pain, index) => (
            <PainCard key={pain.title} index={index} title={pain.title} body={pain.body} />
          ))}
        </div>

        <div
          style={{
            ...riseIn(closing, 18),
            marginTop: 64,
            fontSize: 40,
            fontWeight: 700,
            color: COLORS.inkMuted,
          }}
        >
          毎月、同じことのくり返し。
        </div>
      </AbsoluteFill>
    </Screen>
  );
};

const PainCard = ({ index, title, body }: { index: number; title: string; body: string }) => {
  const delay = 24 + index * 28;
  const enter = useSpringIn(delay, 30);
  const badge = useBounceIn(delay + 14);

  return (
    <div
      style={{
        ...riseIn(enter, 40),
        position: "relative",
        width: 468,
        padding: "48px 44px 44px",
        borderRadius: 32,
        backgroundColor: COLORS.bg,
        border: `2px solid ${COLORS.line}`,
        boxShadow: SHADOW.card,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 28,
      }}
    >
      <div
        style={{
          ...popIn(badge, 0.4),
          position: "absolute",
          top: -26,
          right: -18,
          width: 64,
          height: 64,
          borderRadius: "50%",
          backgroundColor: COLORS.rose,
          color: COLORS.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 10px 22px rgba(225, 29, 72, 0.28)",
        }}
      >
        <IconCross size={34} strokeWidth={3} />
      </div>

      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PainVisual index={index} delay={delay} />
      </div>

      <div style={{ fontSize: 40, fontWeight: 800, whiteSpace: "nowrap" }}>{title}</div>
      <div
        style={{
          fontSize: 27,
          fontWeight: 600,
          lineHeight: 1.7,
          color: COLORS.inkMuted,
          textAlign: "center",
          whiteSpace: "pre-line",
        }}
      >
        {body}
      </div>
    </div>
  );
};

const PainVisual = ({ index, delay }: { index: number; delay: number }) => {
  if (index === 0) return <ScatteredInputs delay={delay} />;
  if (index === 1) return <ChasingReminder delay={delay} />;

  return <UnreadShift delay={delay} />;
};

/** 記号1: 入り口がバラバラ。3つの経路がそれぞれ違う角度で置かれている。 */
const ScatteredInputs = ({ delay }: { delay: number }) => {
  const items: Array<{ icon: ReactNode; rotate: number; x: number; y: number; color: string }> = [
    { icon: <IconChat size={44} />, rotate: -12, x: -104, y: 14, color: COLORS.lineBrand },
    { icon: <IconMail size={44} />, rotate: 8, x: 0, y: -22, color: COLORS.inkSoft },
    { icon: <IconCalendar size={44} />, rotate: 14, x: 104, y: 20, color: COLORS.inkSoft },
  ];

  return (
    <div style={{ position: "relative", width: 300, height: 160 }}>
      {items.map((item, itemIndex) => (
        <Tile
          key={item.rotate}
          delay={delay + 16 + itemIndex * 7}
          rotate={item.rotate}
          x={item.x}
          y={item.y}
          color={item.color}
        >
          {item.icon}
        </Tile>
      ))}
    </div>
  );
};

const Tile = ({
  children,
  delay,
  rotate,
  x,
  y,
  color,
}: {
  children: ReactNode;
  delay: number;
  rotate: number;
  x: number;
  y: number;
  color: string;
}) => {
  const enter = useBounceIn(delay);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        marginLeft: -46,
        marginTop: -46,
        width: 92,
        height: 92,
        borderRadius: 24,
        backgroundColor: COLORS.surface,
        border: `2px solid ${COLORS.line}`,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: enter,
        transform: `translate(${x}px, ${y}px) rotate(${rotate * enter}deg) scale(${0.6 + 0.4 * enter})`,
      }}
    >
      {children}
    </div>
  );
};

/** 記号2: 何度も鳴らすベル。1人だけ提出できていない。 */
const ChasingReminder = ({ delay }: { delay: number }) => {
  const enter = useBounceIn(delay + 14);
  const swing = Math.sin(useLoop(26, delay) * Math.PI * 2) * 10;
  const members = [true, true, false, true];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, opacity: enter }}>
      <div style={{ color: COLORS.amber, transform: `rotate(${swing}deg)`, transformOrigin: "top center" }}>
        <IconBell size={84} strokeWidth={1.8} />
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {members.map((submitted, memberIndex) => (
          <div
            key={memberIndex}
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              backgroundColor: submitted ? COLORS.tealTint : COLORS.bg,
              border: `2px solid ${submitted ? COLORS.tealSoft : COLORS.rose}`,
              color: submitted ? COLORS.teal : COLORS.rose,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {submitted ? <IconCheck size={24} strokeWidth={3} /> : <IconCross size={24} strokeWidth={3} />}
          </div>
        ))}
      </div>
    </div>
  );
};

/** 記号3: 共有したはずのシフトが読まれていない。 */
const UnreadShift = ({ delay }: { delay: number }) => {
  const enter = useBounceIn(delay + 14);
  const blink = 0.45 + 0.55 * Math.abs(Math.sin(useLoop(40, delay) * Math.PI));

  return (
    <div style={{ position: "relative", opacity: enter, color: COLORS.inkSoft }}>
      <IconCalendar size={112} strokeWidth={1.6} />
      <div
        style={{
          position: "absolute",
          right: -26,
          bottom: -12,
          width: 62,
          height: 62,
          borderRadius: "50%",
          backgroundColor: COLORS.amber,
          color: COLORS.bg,
          fontSize: 36,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: blink,
        }}
      >
        ?
      </div>
    </div>
  );
};
