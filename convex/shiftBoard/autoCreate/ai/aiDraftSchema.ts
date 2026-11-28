import { z } from "zod";

// AIが返す勤務の形。構造化出力のスキーマと、返り値の読み取りの両方に使う。
// スタッフとポジションは、AIへ渡したデータの番号で受け取る。IDと名前はAIに出させない。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

export const aiDraftShiftSchema = z.object({
  /** データの`staff[].s`。 */
  staff: z.number().int(),
  /** YYYY-MM-DD。 */
  date: z.string(),
  /** 開始の早い順の、切れ目のない勤務。空ならその日は休み。 */
  segments: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      /** データの`positions[].p`。 */
      position: z.number().int(),
    }),
  ),
  breaks: z.array(z.object({ from: z.string(), to: z.string() })),
  /** 何をどう変えたか。試すあいだの確認に使い、画面には出さない。 */
  change: z.string(),
});

export const aiDraftOutputSchema = z.object({ shifts: z.array(aiDraftShiftSchema) });

export type AiDraftShift = z.infer<typeof aiDraftShiftSchema>;
export type AiDraftOutput = z.infer<typeof aiDraftOutputSchema>;
