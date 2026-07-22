import type { SetActiveNavigate } from "@clerk/shared/types";

const SESSION_CREATION_ERROR = "セッションを作成できませんでした。時間をおいてもう一度お試しください。";

type FinalizableAuthResource = {
  createdSessionId: string | null;
  finalize: (params: { navigate: SetActiveNavigate }) => Promise<{ error: unknown | null }>;
};

type CompleteAuthSessionParams = {
  resource: FinalizableAuthResource;
  redirectTo: string;
  onErrorMessage: (message: string) => void;
};

export async function completeAuthSession({ resource, redirectTo, onErrorMessage }: CompleteAuthSessionParams) {
  if (!resource.createdSessionId) {
    onErrorMessage(SESSION_CREATION_ERROR);
    return;
  }

  const result = await resource.finalize({
    navigate: ({ decorateUrl }) => window.location.assign(decorateUrl(redirectTo)),
  });
  if (result.error) throw result.error;
}
