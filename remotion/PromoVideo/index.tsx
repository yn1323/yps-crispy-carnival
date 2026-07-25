import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill } from "remotion";
import { AutomationScene } from "../scenes/Automation";
import { CtaScene } from "../scenes/Cta";
import { HookScene } from "../scenes/Hook";
import { LogoRevealScene } from "../scenes/LogoReveal";
import { PainScene } from "../scenes/Pain";
import { SubmissionTypesScene } from "../scenes/SubmissionTypes";
import { ThreeStepsScene } from "../scenes/ThreeSteps";
import { UseCasesScene } from "../scenes/UseCases";
import { COLORS } from "../theme";

/**
 * 60秒（30fps / 1800フレーム）の紹介動画。
 * 各シーンの長さの合計 1905 から、トランジション 15f × 7 = 105 が相殺されて 1800 になる。
 */
const TRANSITION = 15;

const timing = linearTiming({ durationInFrames: TRANSITION });

export const PromoVideo = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={150}>
        <HookScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={255}>
        <PainScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={165}>
        <LogoRevealScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={375}>
        <ThreeStepsScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={315}>
        <AutomationScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={255}>
        <SubmissionTypesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={165}>
        <UseCasesScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: "from-bottom" })} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={225}>
        <CtaScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
