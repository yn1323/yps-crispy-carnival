import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { riseIn, useFadeWindow, useLoop, useRange, useSpringIn } from "../../animation";
import { CheckCircle } from "../../components/CheckCircle";
import { IconBell, IconChat, IconCheck, IconMail, IconSend } from "../../components/Icons";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Screen } from "../../components/Screen";
import { COLORS } from "../../theme";

type Beat = {
  title: string;
  body: string;
  icon: ReactNode;
  window: readonly [number, number];
};

const BEATS: readonly Beat[] = [
  {
    title: "LINEで希望シフトを回収",
    body: "募集を作ると同時に、提出リンクを自動で送信",
    icon: <IconChat size={38} />,
    window: [20, 118],
  },
  {
    title: "未提出の人へ自動リマインド",
    body: "「シフトまだ？」と、ひとりずつ聞いて回らなくていい",
    icon: <IconBell size={38} />,
    window: [118, 216],
  },
  {
    title: "確定シフトを自動で共有",
    body: "決まった瞬間に全員へ。「見てなかった」を防ぐ",
    icon: <IconSend size={38} />,
    window: [216, 312],
  },
] as const;

export const AutomationScene = () => {
  const phone = useSpringIn(4, 34);

  return (
    <Screen>
      <AbsoluteFill style={{ padding: "80px 120px", flexDirection: "row", alignItems: "center", gap: 96 }}>
        <div style={{ opacity: phone, transform: `translateY(${(1 - phone) * 40}px)` }}>
          <PhoneFrame width={400}>
            <PhoneScreenCollect />
            <PhoneScreenRemind />
            <PhoneScreenShare />
          </PhoneFrame>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 34 }}>
          <Headline />
          {BEATS.map((beat, index) => (
            <BeatRow key={beat.title} beat={beat} index={index} />
          ))}
        </div>
      </AbsoluteFill>
    </Screen>
  );
};

const Headline = () => {
  const enter = useSpringIn(0);

  return (
    <h1 style={{ ...riseIn(enter, 24), margin: "0 0 10px", fontSize: 64, fontWeight: 800, lineHeight: 1.3 }}>
      回収・催促・共有は、
      <br />
      <span style={{ color: COLORS.teal }}>ぜんぶ自動。</span>
    </h1>
  );
};

const BeatRow = ({ beat, index }: { beat: Beat; index: number }) => {
  const frame = useCurrentFrame();
  const enter = useSpringIn(14 + index * 16, 28);
  const [from, to] = beat.window;
  const isActive = frame >= from && frame < to;

  return (
    <div
      style={{
        ...riseIn(enter, 28),
        display: "flex",
        alignItems: "center",
        gap: 26,
        padding: "26px 32px",
        borderRadius: 26,
        backgroundColor: isActive ? COLORS.tealTint : COLORS.bg,
        border: `2px solid ${isActive ? COLORS.tealSoft : COLORS.line}`,
        opacity: isActive ? 1 : 0.52,
        transform: `translateX(${isActive ? 12 : 0}px)`,
      }}
    >
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: 22,
          flexShrink: 0,
          backgroundColor: isActive ? COLORS.teal : COLORS.surface,
          color: isActive ? COLORS.bg : COLORS.inkMuted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {beat.icon}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 38, fontWeight: 800 }}>{beat.title}</div>
        <div style={{ fontSize: 25, fontWeight: 600, color: COLORS.inkMuted }}>{beat.body}</div>
      </div>
    </div>
  );
};

/** 画面の骨格。ヘッダーは上、本文は中央寄せ、フッターは下端に固定する。 */
const PhoneLayer = ({
  from,
  to,
  header,
  footer,
  align = "center",
  children,
}: {
  from: number;
  to: number;
  header: ReactNode;
  footer: ReactNode;
  align?: "center" | "start";
  children: ReactNode;
}) => {
  const opacity = useFadeWindow(from, to, 10);

  return (
    <AbsoluteFill style={{ padding: "62px 22px 24px", opacity, display: "flex", flexDirection: "column", gap: 14 }}>
      {header}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: align === "center" ? "center" : "flex-start",
          gap: 14,
        }}
      >
        {children}
      </div>
      {footer}
    </AbsoluteFill>
  );
};

/** LINEの入力欄。画面下端を実物らしく締める。 */
const MessageInputBar = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      borderRadius: 999,
      backgroundColor: COLORS.bg,
      border: `1px solid ${COLORS.line}`,
      color: COLORS.inkMuted,
      fontSize: 14,
      fontWeight: 700,
    }}
  >
    メッセージを入力
    <div style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: "50%", backgroundColor: COLORS.line }} />
  </div>
);

const PhoneHeader = ({ label }: { label: string }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      borderRadius: 14,
      backgroundColor: COLORS.bg,
      border: `1px solid ${COLORS.line}`,
      fontSize: 17,
      fontWeight: 800,
      color: COLORS.inkSoft,
      flexShrink: 0,
    }}
  >
    <div style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: COLORS.teal }} />
    {label}
  </div>
);

const PhoneFooter = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "12px 14px",
      borderRadius: 14,
      backgroundColor: COLORS.tealTint,
      color: COLORS.teal,
      fontSize: 15,
      fontWeight: 800,
    }}
  >
    {children}
  </div>
);

const DateDivider = ({ label }: { label: string }) => (
  <div style={{ display: "flex", justifyContent: "center" }}>
    <div
      style={{
        padding: "5px 14px",
        borderRadius: 999,
        backgroundColor: COLORS.line,
        color: COLORS.inkMuted,
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  </div>
);

const LineBubble = ({ text, appear }: { text: string; appear: number }) => (
  <div
    style={{
      alignSelf: "flex-start",
      maxWidth: 260,
      padding: "14px 16px",
      borderRadius: 18,
      backgroundColor: COLORS.lineBrand,
      color: COLORS.bg,
      fontSize: 17,
      fontWeight: 700,
      lineHeight: 1.5,
      whiteSpace: "pre-line",
      opacity: appear,
      transform: `translateY(${(1 - appear) * 14}px)`,
    }}
  >
    {text}
  </div>
);

/** 回収: LINEに提出リンクが届き、そのままスマホで入力できる。 */
const PhoneScreenCollect = () => {
  const bubble = useRange(28, 50);
  const button = useRange(48, 66);
  const second = useRange(76, 94);
  const ripple = useLoop(42, 66);

  return (
    <PhoneLayer
      from={12}
      to={124}
      align="start"
      header={<PhoneHeader label="LINE" />}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <MessageInputBar />
          <PhoneFooter>アプリのインストールは不要</PhoneFooter>
        </div>
      }
    >
      <DateDivider label="10月20日" />

      <LineBubble text={"11月前半の希望シフトを\n出してください"} appear={bubble} />

      <div
        style={{
          position: "relative",
          alignSelf: "flex-start",
          padding: "14px 22px",
          borderRadius: 14,
          backgroundColor: COLORS.teal,
          color: COLORS.bg,
          fontSize: 18,
          fontWeight: 800,
          opacity: button,
          transform: `translateY(${(1 - button) * 12}px)`,
        }}
      >
        希望を入力する
        <div
          style={{
            position: "absolute",
            right: -10,
            bottom: -10,
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: `3px solid ${COLORS.teal}`,
            opacity: button * (1 - ripple),
            transform: `scale(${0.4 + ripple * 1.6})`,
          }}
        />
      </div>

      <LineBubble text={"締切は10月25日（金）です"} appear={second} />
    </PhoneLayer>
  );
};

const MEMBERS = ["田中さん", "佐藤さん", "鈴木さん", "高橋さん", "伊藤さん"] as const;
/** 提出できていない人。ここだけリマインドの対象になる。 */
const UNSUBMITTED_INDEX = 2;

/** 催促: 未提出の人にだけ、自動でお知らせが届く。 */
const PhoneScreenRemind = () => {
  const card = useRange(124, 142);
  const rows = useRange(140, 178);
  const bar = useRange(142, 174);

  return (
    <PhoneLayer
      from={118}
      to={222}
      header={<PhoneHeader label="提出状況" />}
      footer={<PhoneFooter>締切前に自動でもう一度お知らせ</PhoneFooter>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: card }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800 }}>
          <span style={{ color: COLORS.inkMuted }}>提出済み</span>
          <span style={{ color: COLORS.teal }}>4 / 5人</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, backgroundColor: COLORS.line, overflow: "hidden" }}>
          <div style={{ width: `${bar * 80}%`, height: "100%", borderRadius: 999, backgroundColor: COLORS.teal }} />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 16,
          backgroundColor: "#fffbeb",
          border: `1px solid ${COLORS.amber}`,
          color: COLORS.amber,
          fontSize: 15,
          fontWeight: 800,
          opacity: card,
          transform: `translateY(${(1 - card) * 12}px)`,
        }}
      >
        <IconBell size={20} />
        未提出の1名へ自動で送信
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MEMBERS.map((member, index) => {
          const submitted = index !== UNSUBMITTED_INDEX;
          const appear = interpolate(rows, [index * 0.16, index * 0.16 + 0.3], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={member}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "11px 14px",
                borderRadius: 14,
                backgroundColor: COLORS.bg,
                border: `1px solid ${submitted ? COLORS.line : COLORS.amber}`,
                fontSize: 16,
                fontWeight: 700,
                color: COLORS.inkSoft,
                opacity: appear,
                transform: `translateX(${(1 - appear) * 16}px)`,
              }}
            >
              {member}
              {submitted ? (
                <span style={{ color: COLORS.teal, display: "flex", alignItems: "center", gap: 4 }}>
                  <IconCheck size={18} strokeWidth={3} />
                  提出済
                </span>
              ) : (
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    backgroundColor: COLORS.amber,
                    color: COLORS.bg,
                    fontSize: 14,
                  }}
                >
                  催促中
                </span>
              )}
            </div>
          );
        })}
      </div>
    </PhoneLayer>
  );
};

const SHARE_ROWS = ["田中さん", "佐藤さん", "鈴木さん", "高橋さん"] as const;
const SHARE_DAYS = ["月", "火", "水", "木", "金"] as const;

/** 共有: 確定したシフトが、そのまま全員に届く。 */
const PhoneScreenShare = () => {
  const board = useRange(224, 266);
  const done = useRange(262, 296);

  return (
    <PhoneLayer
      from={216}
      to={315}
      header={<PhoneHeader label="11月前半のシフト" />}
      footer={
        <PhoneFooter>
          <IconChat size={18} />
          LINE
          <IconMail size={18} />
          メール
        </PhoneFooter>
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 14,
          borderRadius: 16,
          backgroundColor: COLORS.bg,
          border: `1px solid ${COLORS.line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 74 }} />
          <div style={{ display: "flex", gap: 5 }}>
            {SHARE_DAYS.map((day) => (
              <div
                key={day}
                style={{ width: 30, textAlign: "center", fontSize: 13, fontWeight: 700, color: COLORS.inkMuted }}
              >
                {day}
              </div>
            ))}
          </div>
        </div>

        {SHARE_ROWS.map((member, index) => {
          const appear = interpolate(board, [index * 0.2, index * 0.2 + 0.34], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div key={member} style={{ display: "flex", alignItems: "center", gap: 10, opacity: appear }}>
              <div style={{ width: 74, fontSize: 15, fontWeight: 700, color: COLORS.inkSoft }}>{member}</div>
              <div style={{ display: "flex", gap: 5 }}>
                {SHARE_DAYS.map((day, cell) => {
                  const filled = (index + cell) % 3 === 0;

                  return (
                    <div
                      key={day}
                      style={{
                        width: 30,
                        height: 24,
                        borderRadius: 7,
                        backgroundColor: filled ? COLORS.teal : COLORS.surface,
                        border: `1px solid ${filled ? COLORS.teal : COLORS.line}`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, opacity: done }}>
        <CheckCircle progress={done} size={44} />
        <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.teal }}>全員に共有しました</div>
      </div>
    </PhoneLayer>
  );
};
