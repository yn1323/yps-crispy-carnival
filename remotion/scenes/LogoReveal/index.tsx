import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp01, popIn, riseIn, useBounceIn, useSpringIn } from "../../animation";
import { Screen } from "../../components/Screen";
import { COLORS } from "../../theme";

/** 散らばっていたやり取りが、中央のひとつに集まる。 */
const PARTICLES = [
  { x: -760, y: -330, color: COLORS.lineBrand, delay: 0 },
  { x: -160, y: -420, color: COLORS.inkMuted, delay: 3 },
  { x: 660, y: -300, color: COLORS.inkMuted, delay: 6 },
  { x: -700, y: 320, color: COLORS.lineBrand, delay: 2 },
  { x: -60, y: 400, color: COLORS.inkMuted, delay: 8 },
  { x: 700, y: 300, color: COLORS.inkMuted, delay: 5 },
  { x: 880, y: 30, color: COLORS.tealBright, delay: 10 },
  { x: -900, y: -20, color: COLORS.tealBright, delay: 12 },
] as const;

export const LogoRevealScene = () => {
  const frame = useCurrentFrame();
  const burst = interpolate(frame, [34, 64], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logo = useBounceIn(38);
  const tagline = useSpringIn(62);
  const subline = useSpringIn(78);

  return (
    <Screen tone="tint">
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {PARTICLES.map((particle) => (
          <Particle key={`${particle.x}-${particle.y}`} {...particle} />
        ))}

        <div
          style={{
            position: "absolute",
            width: 360,
            height: 360,
            borderRadius: "50%",
            border: `3px solid ${COLORS.tealBright}`,
            opacity: (1 - burst) * 0.5,
            transform: `scale(${0.3 + burst * 2.4})`,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
        <Img
          src={staticFile("textlogo_black.png")}
          alt="シフトリ"
          style={{ ...popIn(logo, 0.6), width: 700, height: "auto" }}
        />

        <div style={{ ...riseIn(tagline, 26), fontSize: 66, fontWeight: 800, textAlign: "center", lineHeight: 1.35 }}>
          シフトのやり取りを、
          <span style={{ color: COLORS.teal }}>LINEやメール</span>
          でひとつに。
        </div>

        <div style={{ ...riseIn(subline, 20), fontSize: 36, fontWeight: 700, color: COLORS.inkSoft }}>
          スタッフはアプリ不要。無料ではじめられます。
        </div>
      </AbsoluteFill>
    </Screen>
  );
};

const Particle = ({ x, y, color, delay }: { x: number; y: number; color: string; delay: number }) => {
  const converge = useSpringIn(delay, 34);
  const remaining = 1 - clamp01(converge);

  return (
    <div
      style={{
        position: "absolute",
        width: 58,
        height: 58,
        borderRadius: 18,
        backgroundColor: color,
        opacity: remaining * 0.85,
        transform: `translate(${x * remaining}px, ${y * remaining}px) scale(${0.25 + remaining * 0.75})`,
      }}
    />
  );
};
