import { Composition, Folder } from "remotion";
import { ShiftoriIntro } from "./ShiftoriIntro/ShiftoriIntro";
import { S0Title } from "./ShiftoriIntro/scenes/S0Title";
import { S1Chaos } from "./ShiftoriIntro/scenes/S1Chaos";
import { S2Intro } from "./ShiftoriIntro/scenes/S2Intro";
import { S3Recruit } from "./ShiftoriIntro/scenes/S3Recruit";
import { S4Collect } from "./ShiftoriIntro/scenes/S4Collect";
import { S5Build } from "./ShiftoriIntro/scenes/S5Build";
import { S6Confirm } from "./ShiftoriIntro/scenes/S6Confirm";
import { S7OnlyThree } from "./ShiftoriIntro/scenes/S7OnlyThree";
import { S8Methods } from "./ShiftoriIntro/scenes/S8Methods";
import { S9Start } from "./ShiftoriIntro/scenes/S9Start";

export const RemotionRoot = () => (
  <>
    <Folder name="ShiftoriIntro-Scenes">
      <Composition id="S0Title" component={S0Title} width={1920} height={1080} fps={30} durationInFrames={90} />
      <Composition id="S1Chaos" component={S1Chaos} width={1920} height={1080} fps={30} durationInFrames={210} />
      <Composition id="S2Intro" component={S2Intro} width={1920} height={1080} fps={30} durationInFrames={180} />
      <Composition id="S3Recruit" component={S3Recruit} width={1920} height={1080} fps={30} durationInFrames={330} />
      <Composition id="S4Collect" component={S4Collect} width={1920} height={1080} fps={30} durationInFrames={210} />
      <Composition id="S5Build" component={S5Build} width={1920} height={1080} fps={30} durationInFrames={210} />
      <Composition id="S6Confirm" component={S6Confirm} width={1920} height={1080} fps={30} durationInFrames={180} />
      <Composition
        id="S7OnlyThree"
        component={S7OnlyThree}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={120}
      />
      <Composition id="S8Methods" component={S8Methods} width={1920} height={1080} fps={30} durationInFrames={210} />
      <Composition id="S9Start" component={S9Start} width={1920} height={1080} fps={30} durationInFrames={150} />
    </Folder>
    <Composition
      id="ShiftoriIntro"
      component={ShiftoriIntro}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={1890}
    />
  </>
);
