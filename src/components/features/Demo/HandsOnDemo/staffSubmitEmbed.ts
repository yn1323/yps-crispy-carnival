// スタッフの提出画面を、体験デモのスマートフォンの枠へ読み込むときの決まり。
// 選択欄の一覧とメモの画面は画面全体に重ねて開くため、枠の中でも本物のまま動くよう、別の画面としてiframeで読み込む。

/** 枠へ読み込む画面のURL。 */
export const HANDS_ON_STAFF_SUBMIT_PATH = "/shifts/demo-submit";

/** 枠の中の画面の大きさ。スマートフォンと同じ幅で描き、枠に合わせて縮める。 */
export const HANDS_ON_STAFF_SUBMIT_VIEWPORT = { width: 390, height: 752 } as const;

/** 提出まで終えたことを、読み込んだ側へ知らせるmessageの種類。値は持たない。 */
export const HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE = "shiftori:hands-on-staff-submit-done";

/**
 * 自動で操作した手順の進み具合（0から1の数）と、いまの手順を、読み込んだ側へ知らせるmessageの種類。
 * 入力した値は送らない。
 */
export const HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE = "shiftori:hands-on-staff-submit-progress";

/** 提出画面の自動操作の手順。日と時間を選ぶ、メモを書く、休みに戻すボタンを示す、提出したあと。 */
export const HANDS_ON_STAFF_SUBMIT_STEPS = ["choose", "memo", "remove", "update"] as const;
export type HandsOnStaffSubmitStep = (typeof HANDS_ON_STAFF_SUBMIT_STEPS)[number];

export type HandsOnStaffSubmitProgress = { progress: number; step: HandsOnStaffSubmitStep };

export const buildStaffSubmitSrc = (periodStart: string) =>
  `${HANDS_ON_STAFF_SUBMIT_PATH}?start=${encodeURIComponent(periodStart)}`;

export const isStaffSubmitDoneMessage = (data: unknown): boolean =>
  typeof data === "object" && data !== null && (data as { type?: unknown }).type === HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE;

const isStaffSubmitStep = (value: unknown): value is HandsOnStaffSubmitStep =>
  (HANDS_ON_STAFF_SUBMIT_STEPS as readonly unknown[]).includes(value);

/** 進み具合の知らせなら、0から1の数といまの手順を返す。ほかの知らせや、範囲の外の数、知らない手順ならnullを返す。 */
export const readStaffSubmitProgress = (data: unknown): HandsOnStaffSubmitProgress | null => {
  if (typeof data !== "object" || data === null) return null;
  const { type, progress, step } = data as { type?: unknown; progress?: unknown; step?: unknown };
  if (type !== HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE) return null;
  if (typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 1) return null;
  if (!isStaffSubmitStep(step)) return null;
  return { progress, step };
};
