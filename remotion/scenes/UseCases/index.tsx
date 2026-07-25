import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { popIn, riseIn, useBounceIn, useSpringIn } from "../../animation";
import {
  IconBag,
  IconHeart,
  IconMegaphone,
  IconScissors,
  IconSmartphone,
  IconSparkles,
  IconUtensils,
  IconWallet,
} from "../../components/Icons";
import { SceneHeader } from "../../components/SceneHeader";
import { Screen } from "../../components/Screen";
import { COLORS, SHADOW } from "../../theme";

const SHOPS: ReadonlyArray<{ label: string; icon: ReactNode }> = [
  { label: "飲食店", icon: <IconUtensils size={46} /> },
  { label: "小売店", icon: <IconBag size={46} /> },
  { label: "介護・施設", icon: <IconHeart size={46} /> },
  { label: "イベント運営", icon: <IconMegaphone size={46} /> },
  { label: "美容・サロン", icon: <IconScissors size={46} /> },
];

const POINTS: ReadonlyArray<{ label: string; icon: ReactNode }> = [
  { label: "スタッフはアプリ不要", icon: <IconSmartphone size={30} /> },
  { label: "無料ではじめられる", icon: <IconWallet size={30} /> },
  { label: "スマホだけで完結", icon: <IconSparkles size={30} /> },
];

export const UseCasesScene = () => (
  <Screen>
    <AbsoluteFill
      style={{ padding: "96px 120px", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
    >
      <SceneHeader title="いろいろなお店で、使われています" />

      <div style={{ display: "flex", gap: 26, marginTop: 76 }}>
        {SHOPS.map((shop, index) => (
          <ShopTile key={shop.label} label={shop.label} icon={shop.icon} index={index} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 26, marginTop: 76 }}>
        {POINTS.map((point, index) => (
          <PointPill key={point.label} label={point.label} icon={point.icon} index={index} />
        ))}
      </div>
    </AbsoluteFill>
  </Screen>
);

const ShopTile = ({ label, icon, index }: { label: string; icon: ReactNode; index: number }) => {
  const enter = useBounceIn(20 + index * 7);

  return (
    <div
      style={{
        ...popIn(enter, 0.6),
        width: 300,
        height: 270,
        borderRadius: 30,
        backgroundColor: COLORS.bg,
        border: `2px solid ${COLORS.line}`,
        boxShadow: SHADOW.card,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
      }}
    >
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: 26,
          backgroundColor: COLORS.tealTint,
          color: COLORS.teal,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800 }}>{label}</div>
    </div>
  );
};

const PointPill = ({ label, icon, index }: { label: string; icon: ReactNode; index: number }) => {
  const enter = useSpringIn(72 + index * 10, 26);

  return (
    <div
      style={{
        ...riseIn(enter, 22),
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "22px 34px",
        borderRadius: 999,
        backgroundColor: COLORS.teal,
        color: COLORS.bg,
        fontSize: 32,
        fontWeight: 800,
      }}
    >
      {icon}
      {label}
    </div>
  );
};
