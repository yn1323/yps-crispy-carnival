export type RouterErrorDetail = {
  route: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
  try {
    if (typeof error === "string" && error) return error;
    if (isRecord(error) && typeof error.message === "string" && error.message) return error.message;
  } catch {
    // エラー自身のプロパティが読めなくても、復旧操作は残す。
  }
  return "エラーの詳細を取得できませんでした。";
}

/** Router全体を表示せず、失敗したrouteの識別子とmessageだけをコピーする。 */
export function extractRouterErrors(router: unknown): RouterErrorDetail[] {
  try {
    if (!isRecord(router)) return [];
    const state = router.state;
    if (!isRecord(state) || !Array.isArray(state.matches)) return [];

    return state.matches.flatMap((match: unknown) => {
      if (!isRecord(match) || match.status !== "error") return [];
      const route = match.routeId;
      const error = match.error;
      const message = isRecord(error) ? error.message : undefined;
      return typeof route === "string" && typeof message === "string" ? [{ route, message }] : [];
    });
  } catch {
    return [];
  }
}

export function formatErrorDetails(error: unknown, routerErrors: readonly RouterErrorDetail[]): string {
  const message = getErrorMessage(error);
  try {
    const details = routerErrors.map(({ route, message }) => ({ route, message }));
    if (details.length > 0) return `${message}\n\nルーター内のエラー:\n${JSON.stringify(details, null, 2)}`;
  } catch {
    // 補足情報の整形に失敗しても、元のエラーは表示する。
  }
  return message;
}
