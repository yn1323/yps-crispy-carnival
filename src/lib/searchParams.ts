/** キーの順序と等価なエンコード表記を無視し、重複キーは保持して比較する。 */
export function areSearchParamsEqual(left: string, right: string): boolean {
  const leftParams = new URLSearchParams(left);
  const rightParams = new URLSearchParams(right);
  leftParams.sort();
  rightParams.sort();
  return leftParams.toString() === rightParams.toString();
}
