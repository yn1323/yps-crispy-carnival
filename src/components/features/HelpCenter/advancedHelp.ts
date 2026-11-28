import type { HelpAudience } from "./helpTasks";

export type AdvancedHelpLink = {
  /** 案内先の使い方のID。`/help/<guideId>`を開く。 */
  guideId: string;
  cardTitle: string;
  cardDescription: string;
  audience: HelpAudience;
};

/** ヘルプTOPの「もっと便利に使う」に、PDF・Excelのダウンロードのあとへ並べる使い方。表示する順に並べる。 */
export const ADVANCED_HELP_LINKS = [
  {
    guideId: "set-positions-and-breaks",
    cardTitle: "ポジション・休憩時間を設定したい",
    cardDescription: "ホールやキッチンなどのポジションを作り、勤務と休憩時間を設定します。",
    audience: "manager",
  },
  {
    guideId: "auto-create-shift-draft",
    cardTitle: "シフトの下書きを自動作成したい",
    cardDescription: "希望シフトと必要人数から、募集期間の勤務をまとめて作ります。",
    audience: "manager",
  },
] as const satisfies readonly AdvancedHelpLink[];

export function getAdvancedHelpHref(guideId: string): string {
  return `/help/${guideId}`;
}
