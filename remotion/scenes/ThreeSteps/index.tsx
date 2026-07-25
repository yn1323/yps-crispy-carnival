import type { ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { popIn, riseIn, useRange, useSpringIn } from "../../animation";
import { CalendarGrid } from "../../components/CalendarGrid";
import { Card } from "../../components/Card";
import { CheckCircle } from "../../components/CheckCircle";
import { IconChat, IconMail, IconSend } from "../../components/Icons";
import { SceneHeader } from "../../components/SceneHeader";
import { Screen } from "../../components/Screen";
import { ShiftBoard } from "../../components/ShiftBoard";
import { COLORS } from "../../theme";

type Step = {
  no: string;
  title: string;
  body: string;
  /** カードが主役になるフレーム範囲 */
  active: readonly [number, number];
};

const STEPS: readonly Step[] = [
  {
    no: "01",
    title: "募集期間を決める",
    body: "提出リンクを自動で送信",
    active: [34, 152],
  },
  {
    no: "02",
    title: "シフトを組む",
    body: "集まった希望を見て組むだけ",
    active: [152, 254],
  },
  {
    no: "03",
    title: "シフトを確定する",
    body: "確定と同時に全員へお知らせ",
    active: [254, 352],
  },
] as const;

export const ThreeStepsScene = () => {
  const closing = useSpringIn(336);

  return (
    <Screen>
      <AbsoluteFill style={{ padding: "70px 116px", flexDirection: "column", alignItems: "center" }}>
        <SceneHeader title="毎月のシフト作成は、3ステップ" />

        <div style={{ display: "flex", gap: 44, marginTop: 56 }}>
          {STEPS.map((step, index) => (
            <StepCard key={step.no} step={step} index={index} />
          ))}
        </div>

        <div
          style={{
            ...riseIn(closing, 16),
            marginTop: 46,
            fontSize: 38,
            fontWeight: 800,
            color: COLORS.teal,
          }}
        >
          むずかしい設定は、ありません。
        </div>
      </AbsoluteFill>
    </Screen>
  );
};

const StepCard = ({ step, index }: { step: Step; index: number }) => {
  const frame = useCurrentFrame();
  const enter = useSpringIn(14 + index * 20, 30);
  const [from, to] = step.active;
  const isActive = frame >= from - 12;
  const isDone = frame >= to;

  return (
    <div style={{ ...riseIn(enter, 44) }}>
      <Card active={isActive} dimmed={!isActive} padding={40} style={{ width: 500, height: 648, gap: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <StepBadge no={step.no} done={isDone} />
          <div style={{ fontSize: 38, fontWeight: 800 }}>{step.title}</div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 22,
            backgroundColor: COLORS.surface,
            border: `2px solid ${COLORS.line}`,
          }}
        >
          <StepVisual index={index} from={from} to={to} />
        </div>

        <div style={{ fontSize: 27, fontWeight: 600, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>{step.body}</div>
      </Card>
    </div>
  );
};

const StepBadge = ({ no, done }: { no: string; done: boolean }) => (
  <div
    style={{
      width: 68,
      height: 68,
      borderRadius: 20,
      backgroundColor: done ? COLORS.teal : COLORS.tealTint,
      color: done ? COLORS.bg : COLORS.teal,
      fontSize: 30,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      letterSpacing: "0.02em",
    }}
  >
    {no}
  </div>
);

const StepVisual = ({ index, from, to }: { index: number; from: number; to: number }) => {
  if (index === 0) return <PeriodVisual from={from} to={to} />;
  if (index === 1) return <BuildVisual from={from} to={to} />;

  return <ConfirmVisual from={from} to={to} />;
};

/** 01: 募集期間が染まり、提出リンクが飛んでいく。 */
const PeriodVisual = ({ from, to }: { from: number; to: number }) => {
  const fill = useRange(from, to - 46);
  const send = useRange(to - 44, to - 4, Easing.out(Easing.cubic));

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CalendarGrid progress={fill} cellSize={40} gap={6} rangeStart={6} rangeEnd={19} />

      <div
        style={{
          position: "absolute",
          right: -22,
          top: -18,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px",
          borderRadius: 999,
          backgroundColor: COLORS.teal,
          color: COLORS.bg,
          fontSize: 22,
          fontWeight: 700,
          opacity: interpolate(send, [0, 0.2, 0.85, 1], [0, 1, 1, 0]),
          transform: `translate(${send * 46}px, ${-send * 54}px)`,
        }}
      >
        <IconSend size={24} />
        提出リンク
      </div>
    </div>
  );
};

/** 02: 集まった希望が、シフト表のマスに埋まっていく。 */
const BuildVisual = ({ from, to }: { from: number; to: number }) => {
  const fill = useRange(from + 6, to - 8);

  return <ShiftBoard progress={fill} cellWidth={40} cellHeight={30} gap={6} />;
};

/** 03: 確定のチェックが入り、全員へ通知が飛ぶ。 */
const ConfirmVisual = ({ from, to }: { from: number; to: number }) => {
  const check = useRange(from + 4, from + 44);
  const notify = useRange(from + 40, to - 6, Easing.out(Easing.cubic));

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      <CheckCircle progress={check} size={124} />
      <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.teal, ...popIn(check) }}>シフト確定</div>

      <div style={{ display: "flex", gap: 16 }}>
        <NotifyChip icon={<IconChat size={22} />} label="LINE" progress={notify} delay={0} />
        <NotifyChip icon={<IconMail size={22} />} label="メール" progress={notify} delay={0.18} />
      </div>
    </div>
  );
};

const NotifyChip = ({
  icon,
  label,
  progress,
  delay,
}: {
  icon: ReactNode;
  label: string;
  progress: number;
  delay: number;
}) => {
  const local = interpolate(progress, [delay, delay + 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 999,
        backgroundColor: COLORS.bg,
        border: `2px solid ${COLORS.tealSoft}`,
        color: COLORS.teal,
        fontSize: 22,
        fontWeight: 700,
        opacity: local,
        transform: `translateY(${(1 - local) * 18}px)`,
      }}
    >
      {icon}
      {label}
    </div>
  );
};
