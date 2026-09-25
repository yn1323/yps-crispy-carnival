import { Series } from "remotion";
import { S0Title } from "./scenes/S0Title";
import { S1Chaos } from "./scenes/S1Chaos";
import { S2Intro } from "./scenes/S2Intro";
import { S3Recruit } from "./scenes/S3Recruit";
import { S4Collect } from "./scenes/S4Collect";
import { S5Build } from "./scenes/S5Build";
import { S6Confirm } from "./scenes/S6Confirm";
import { S7OnlyThree } from "./scenes/S7OnlyThree";
import { S8Methods } from "./scenes/S8Methods";
import { S9Start } from "./scenes/S9Start";

// 絵コンテ: doc/plans/2026-09-25_LP紹介動画_絵コンテ.md
export const ShiftoriIntro = () => (
  <Series>
    <Series.Sequence name="S0 タイトル" durationInFrames={90} premountFor={30}>
      <S0Title />
    </Series.Sequence>
    <Series.Sequence name="S1 今のやり取り" durationInFrames={210} premountFor={30}>
      <S1Chaos />
    </Series.Sequence>
    <Series.Sequence name="S2 その連絡はシフトリにおまかせ！" durationInFrames={180} premountFor={30}>
      <S2Intro />
    </Series.Sequence>
    <Series.Sequence name="S3 シフトを募集する" durationInFrames={330} premountFor={30}>
      <S3Recruit />
    </Series.Sequence>
    <Series.Sequence name="S4 希望シフトが集まる" durationInFrames={210} premountFor={30}>
      <S4Collect />
    </Series.Sequence>
    <Series.Sequence name="S5 希望を見ながらシフトを組む" durationInFrames={210} premountFor={30}>
      <S5Build />
    </Series.Sequence>
    <Series.Sequence name="S6 確定シフトがスタッフに届く" durationInFrames={180} premountFor={30}>
      <S6Confirm />
    </Series.Sequence>
    <Series.Sequence name="S7 毎月の作業をかんたんに" durationInFrames={120} premountFor={30}>
      <S7OnlyThree />
    </Series.Sequence>
    <Series.Sequence name="S8 お店に合う集め方を選べる" durationInFrames={210} premountFor={30}>
      <S8Methods />
    </Series.Sequence>
    <Series.Sequence name="S9 2か月無料でお試しできます" durationInFrames={150} premountFor={30}>
      <S9Start />
    </Series.Sequence>
  </Series>
);
