const SESSION_CREATION_ERROR = "セッションを作成できませんでした。時間をおいてもう一度お試しください。";

type CompleteAuthSessionParams = {
  sessionId: string | null;
  redirectTo: string;
  activateSession?: (sessionId: string) => Promise<unknown>;
  onErrorMessage: (message: string) => void;
};

export async function completeAuthSession({
  sessionId,
  redirectTo,
  activateSession,
  onErrorMessage,
}: CompleteAuthSessionParams) {
  if (!sessionId) {
    onErrorMessage(SESSION_CREATION_ERROR);
    return;
  }

  if (!activateSession) return;

  await activateSession(sessionId);
  window.location.assign(redirectTo);
}
