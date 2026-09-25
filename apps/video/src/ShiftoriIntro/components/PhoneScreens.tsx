import type { ReactNode } from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { CHAT, DOMAIN, GROUP_NAME, METHOD_SCREENS, type PersonId, SHOP_NAME, SUBMIT_PAGE, TODAY } from "../copy";
import { EASE, type Point, popIn, progress } from "../motion";
import { COLORS } from "../theme";
import { CheckBadge } from "./Icons";
import { Avatar } from "./People";

// スマホ画面の内寸は316×676
export const PHONE_SCREEN = { width: 316, height: 676 } as const;

export const LockScreen = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: `linear-gradient(180deg, ${COLORS.mintSoft} 0%, ${COLORS.background} 70%)`,
      textAlign: "center",
      color: COLORS.text,
    }}
  >
    <div style={{ position: "absolute", top: 120, left: 0, right: 0, fontSize: 64, fontWeight: 700 }}>{TODAY.time}</div>
    <div style={{ position: "absolute", top: 206, left: 0, right: 0, fontSize: 18 }}>{TODAY.date}</div>
  </div>
);

export type ChatMessage =
  | { kind: "other"; person: PersonId; name: string; text: string; at: number }
  | { kind: "self"; text: string; at: number }
  | { kind: "image"; at: number };

const MESSAGE_HEIGHT = { other: 64, self: 44, image: 170 } as const;
const MESSAGE_GAP = 12;

/** グループトーク。LINEに似せず、白い背景としっぽのない角丸の吹き出しで描く */
export const ChatScreen = ({ messages }: { messages: ChatMessage[] }) => {
  const frame = useCurrentFrame();
  // 新しいメッセージほど下に置き、届くたびに上のメッセージを押し上げる
  const placed: { message: ChatMessage; bottom: number; grow: number }[] = [];
  let bottom = 16;
  for (const message of [...messages].reverse()) {
    const grow = progress(frame, message.at, 8, EASE.enter);
    placed.push({ message, bottom, grow });
    bottom += (MESSAGE_HEIGHT[message.kind] + MESSAGE_GAP) * grow;
  }
  return (
    <div style={{ position: "absolute", inset: 0, background: COLORS.background }}>
      <div
        style={{
          position: "absolute",
          top: 44,
          left: 0,
          right: 0,
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 16px",
          borderBottom: `2px solid ${COLORS.border}`,
          zIndex: 1,
          background: COLORS.background,
        }}
      >
        <span style={{ fontSize: 22, color: COLORS.muted }}>‹</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>{GROUP_NAME}</span>
        <span style={{ fontSize: 14, color: COLORS.muted }}>{CHAT.members}</span>
      </div>
      {placed.map(({ message, bottom, grow }) => {
        if (grow <= 0) return null;
        const pop = popIn(frame, message.at, 12);
        if (message.kind === "other") {
          return (
            <div
              key={message.at}
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom,
                height: 64,
                ...pop,
                transformOrigin: "0% 100%",
              }}
            >
              <Avatar person={message.person} size={34} style={{ position: "absolute", left: 0, top: 4 }} />
              <div style={{ position: "absolute", left: 44, top: 0, fontSize: 12, color: COLORS.muted }}>
                {message.name}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 44,
                  top: 20,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 14px",
                  borderRadius: 14,
                  background: COLORS.surface,
                  fontSize: 16,
                  color: COLORS.text,
                  whiteSpace: "nowrap",
                }}
              >
                {message.text}
              </div>
            </div>
          );
        }
        if (message.kind === "self") {
          return (
            <div
              key={message.at}
              style={{
                position: "absolute",
                right: 12,
                bottom,
                height: 40,
                display: "flex",
                alignItems: "center",
                padding: "0 14px",
                borderRadius: 14,
                background: COLORS.teal,
                color: COLORS.background,
                fontSize: 16,
                whiteSpace: "nowrap",
                ...pop,
                transformOrigin: "100% 100%",
              }}
            >
              {message.text}
            </div>
          );
        }
        return (
          <div
            key={message.at}
            style={{
              position: "absolute",
              right: 12,
              bottom,
              width: 150,
              height: 170,
              borderRadius: 14,
              border: `2px solid ${COLORS.border}`,
              background: COLORS.background,
              ...pop,
              transformOrigin: "100% 100%",
            }}
          >
            <Img
              src={staticFile("illustrations/paper-shift-sheet.png")}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        );
      })}
    </div>
  );
};

/** ブラウザで開いたことが分かるアドレスバーと見出し */
const BrowserHeader = ({ instruction }: { instruction: string }) => (
  <>
    <div
      style={{
        position: "absolute",
        top: 48,
        left: 16,
        right: 16,
        height: 36,
        borderRadius: 18,
        background: COLORS.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        fontSize: 15,
        color: COLORS.muted,
      }}
    >
      <svg aria-hidden="true" width={13} height={13} viewBox="0 0 24 24" fill="none">
        <rect x="5" y="10" width="14" height="11" rx="2" stroke={COLORS.muted} strokeWidth="2.5" />
        <path d="M8 10 V7 a4 4 0 0 1 8 0 V10" stroke={COLORS.muted} strokeWidth="2.5" />
      </svg>
      {DOMAIN}
    </div>
    <div style={{ position: "absolute", top: 98, left: 18, fontSize: 14, color: COLORS.muted }}>{SHOP_NAME}</div>
    <div style={{ position: "absolute", top: 120, left: 18, fontSize: 24, fontWeight: 700, color: COLORS.text }}>
      {SUBMIT_PAGE.title}
    </div>
    <div
      style={{
        position: "absolute",
        top: 160,
        left: 18,
        right: 18,
        fontSize: 15,
        lineHeight: 1.45,
        color: COLORS.text,
      }}
    >
      {instruction}
    </div>
  </>
);

const SubmitButton = ({ label }: { label: string }) => (
  <div
    style={{
      position: "absolute",
      left: 16,
      right: 16,
      top: 600,
      height: 54,
      borderRadius: 14,
      background: COLORS.teal,
      color: COLORS.background,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 19,
      fontWeight: 700,
    }}
  >
    {label}
  </div>
);

export const SUBMIT_BUTTON_POINT: Point = { x: 158, y: 627 };

const CALENDAR = { top: 214, cell: 40, gap: 3, left: 9 } as const;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 2026年11月は日曜始まり。日付のセルの中心 */
export const calendarDayPoint = (day: number): Point => {
  const index = day - 1;
  const step = CALENDAR.cell + CALENDAR.gap;
  return {
    x: CALENDAR.left + (index % 7) * step + CALENDAR.cell / 2,
    y: CALENDAR.top + 24 + Math.floor(index / 7) * step + CALENDAR.cell / 2,
  };
};

type SubmitScreenProps = { selected?: { day: number; at: number }[]; submittedAt?: number };

/** 日付選択で希望シフトを提出する画面 */
export const DateSelectScreen = ({ selected = [], submittedAt }: SubmitScreenProps) => {
  const frame = useCurrentFrame();
  const step = CALENDAR.cell + CALENDAR.gap;
  return (
    <div style={{ position: "absolute", inset: 0, background: COLORS.background }}>
      <BrowserHeader instruction={METHOD_SCREENS.date.instruction} />
      {WEEKDAYS.map((weekday, index) => (
        <div
          key={weekday}
          style={{
            position: "absolute",
            top: CALENDAR.top,
            left: CALENDAR.left + index * step,
            width: CALENDAR.cell,
            textAlign: "center",
            fontSize: 13,
            color: COLORS.muted,
          }}
        >
          {weekday}
        </div>
      ))}
      {Array.from({ length: 30 }, (_, index) => index + 1).map((day) => {
        const point = calendarDayPoint(day);
        const pick = selected.find((item) => item.day === day);
        const chosen = pick ? progress(frame, pick.at, 6, EASE.enter) : 0;
        return (
          <div
            key={day}
            style={{
              position: "absolute",
              left: point.x - CALENDAR.cell / 2,
              top: point.y - CALENDAR.cell / 2,
              width: CALENDAR.cell,
              height: CALENDAR.cell,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              fontWeight: chosen > 0.5 ? 700 : 400,
              color: chosen > 0.5 ? COLORS.background : COLORS.text,
              background: chosen > 0 ? `rgba(13, 148, 136, ${chosen})` : COLORS.surface,
              scale: pick && frame >= pick.at ? String(popIn(frame, pick.at, 10).scale) : "1",
            }}
          >
            {day}
          </div>
        );
      })}
      <SubmitButton label={SUBMIT_PAGE.button} />
      {submittedAt === undefined ? null : <SubmittedOverlay at={submittedAt} />}
    </div>
  );
};

const SubmittedOverlay = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `rgba(255, 255, 255, ${0.85 * progress(frame, at, 8, EASE.enter)})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ ...popIn(frame, at, 15) }}>
        <CheckBadge size={120} />
      </div>
    </div>
  );
};

/** 時間指定で希望シフトを提出する画面 */
export const TimeSelectScreen = ({ switchAt = [] }: { switchAt?: number[] }) => {
  const frame = useCurrentFrame();
  const switched = switchAt.filter((at) => frame >= at).length % 2 === 1;
  const lastSwitch = [...switchAt].reverse().find((at) => frame >= at);
  return (
    <div style={{ position: "absolute", inset: 0, background: COLORS.background }}>
      <BrowserHeader instruction={METHOD_SCREENS.time.instruction} />
      {METHOD_SCREENS.time.rows.map((row, index) => {
        const isOff = row.value === "休み";
        const value = index === 0 && switched ? METHOD_SCREENS.time.alternate : row.value;
        const pulse = index === 0 && lastSwitch !== undefined ? popIn(frame, lastSwitch, 10) : undefined;
        return (
          <div
            key={row.day}
            style={{
              position: "absolute",
              top: 226 + index * 64,
              left: 16,
              right: 16,
              height: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1.5px solid ${COLORS.border}`,
            }}
          >
            <span style={{ fontSize: 16, color: COLORS.text }}>{row.day}</span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 999,
                color: isOff ? COLORS.muted : COLORS.background,
                background: isOff ? COLORS.surface : COLORS.teal,
                ...pulse,
              }}
            >
              {value}
            </span>
          </div>
        );
      })}
      <SubmitButton label={SUBMIT_PAGE.button} />
    </div>
  );
};

/** パターン選択で希望シフトを提出する画面 */
export const PatternSelectScreen = ({ selectAt = [] }: { selectAt?: { index: number; at: number }[] }) => {
  const frame = useCurrentFrame();
  const current = [...selectAt].reverse().find((item) => frame >= item.at);
  return (
    <div style={{ position: "absolute", inset: 0, background: COLORS.background }}>
      <BrowserHeader instruction={METHOD_SCREENS.pattern.instruction} />
      <div style={{ position: "absolute", top: 232, left: 18, fontSize: 17, fontWeight: 700, color: COLORS.text }}>
        {METHOD_SCREENS.pattern.day}
      </div>
      {METHOD_SCREENS.pattern.options.map((option, index) => {
        const active = current?.index === index;
        return (
          <div
            key={option.name}
            style={{
              position: "absolute",
              top: 272 + index * 96,
              left: 16,
              right: 16,
              height: 80,
              borderRadius: 16,
              border: `2px solid ${active ? COLORS.teal : COLORS.border}`,
              background: active ? COLORS.teal : COLORS.background,
              color: active ? COLORS.background : COLORS.text,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              ...(active && current ? popIn(frame, current.at, 10) : {}),
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700 }}>{option.name}</span>
            <span style={{ fontSize: 15 }}>{option.time}</span>
          </div>
        );
      })}
      <SubmitButton label={SUBMIT_PAGE.button} />
    </div>
  );
};

/** 画面を横にスライドして切り替える */
export const SlideSwitch = ({ at, from, to }: { at: number; from: ReactNode; to: ReactNode }) => {
  const frame = useCurrentFrame();
  const t = progress(frame, at, 12, EASE.move);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, translate: `${-t * PHONE_SCREEN.width}px 0px` }}>{from}</div>
      <div style={{ position: "absolute", inset: 0, translate: `${(1 - t) * PHONE_SCREEN.width}px 0px` }}>{to}</div>
    </>
  );
};
