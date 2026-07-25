import { AbsoluteFill, Img, staticFile } from "remotion";
import { popIn, riseIn, useBounceIn, useBreath, useSpringIn } from "../../animation";
import { IconArrowRight } from "../../components/Icons";
import { Screen } from "../../components/Screen";
import { COLORS, SITE_URL } from "../../theme";

export const CtaScene = () => {
  const card = useSpringIn(0, 32);
  const logo = useBounceIn(16);
  const headline = useSpringIn(30);
  const primary = useSpringIn(44);
  const secondary = useSpringIn(54);
  const url = useSpringIn(70);
  const pulse = useBreath(66, 0.014, 80);

  return (
    <Screen tone="brand">
      <BrandDecoration />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 46 }}>
        <div
          style={{
            ...popIn(card, 0.9),
            width: 1180,
            padding: "72px 80px",
            borderRadius: 48,
            backgroundColor: COLORS.bg,
            color: COLORS.ink,
            boxShadow: "0 40px 90px rgba(2, 39, 38, 0.28)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 44,
          }}
        >
          <Img src={staticFile("textlogo_black.png")} alt="シフトリ" style={{ ...popIn(logo, 0.8), width: 460 }} />

          <div style={{ ...riseIn(headline, 22), fontSize: 58, fontWeight: 800, textAlign: "center" }}>
            毎月のシフト、
            <span style={{ color: COLORS.teal }}>今月からラクに。</span>
          </div>

          <div style={{ display: "flex", gap: 26 }}>
            <div
              style={{
                ...riseIn(primary, 20),
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "26px 52px",
                borderRadius: 18,
                backgroundColor: COLORS.teal,
                color: COLORS.bg,
                fontSize: 36,
                fontWeight: 800,
                transform: `translateY(${(1 - primary) * 20}px) scale(${1 + pulse})`,
              }}
            >
              無料で試してみる
              <IconArrowRight size={30} strokeWidth={2.6} />
            </div>

            <div
              style={{
                ...riseIn(secondary, 20),
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "26px 46px",
                borderRadius: 18,
                backgroundColor: COLORS.bg,
                border: `3px solid ${COLORS.teal}`,
                color: COLORS.teal,
                fontSize: 36,
                fontWeight: 800,
              }}
            >
              登録不要でデモを見る
              <IconArrowRight size={30} strokeWidth={2.6} />
            </div>
          </div>
        </div>

        <div style={{ ...riseIn(url, 18), fontSize: 44, fontWeight: 800, letterSpacing: "0.04em" }}>{SITE_URL}</div>
      </AbsoluteFill>
    </Screen>
  );
};

const BrandDecoration = () => (
  <>
    <div
      style={{
        position: "absolute",
        top: -240,
        left: -180,
        width: 720,
        height: 720,
        borderRadius: "50%",
        backgroundColor: COLORS.tealDeep,
        opacity: 0.45,
      }}
    />
    <div
      style={{
        position: "absolute",
        bottom: -300,
        right: -200,
        width: 820,
        height: 820,
        borderRadius: "50%",
        backgroundColor: COLORS.tealBright,
        opacity: 0.22,
      }}
    />
  </>
);
