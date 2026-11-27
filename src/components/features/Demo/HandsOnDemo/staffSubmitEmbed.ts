// スタッフの提出画面を、体験デモのスマートフォンの枠へ読み込むときの決まり。
// 選択欄の一覧とメモの画面は画面全体に重ねて開くため、枠の中でも本物のまま動くよう、別の画面としてiframeで読み込む。

/** 枠へ読み込む画面のURL。 */
export const HANDS_ON_STAFF_SUBMIT_PATH = "/shifts/demo-submit";

/** 枠の中の画面の大きさ。スマートフォンと同じ幅で描き、枠に合わせて縮める。 */
export const HANDS_ON_STAFF_SUBMIT_VIEWPORT = { width: 390, height: 752 } as const;

/** 提出まで終えたことを、読み込んだ側へ知らせるmessageの種類。値は持たない。 */
export const HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE = "shiftori:hands-on-staff-submit-done";

export const buildStaffSubmitSrc = (periodStart: string) =>
  `${HANDS_ON_STAFF_SUBMIT_PATH}?start=${encodeURIComponent(periodStart)}`;

export const isStaffSubmitDoneMessage = (data: unknown): boolean =>
  typeof data === "object" && data !== null && (data as { type?: unknown }).type === HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE;
