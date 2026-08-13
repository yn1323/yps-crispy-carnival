import { useAuth, useClerk, useReverification } from "@clerk/react";
import { isReverificationCancelledError } from "@clerk/react/errors";
import { useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { selectedShopAtom } from "@/src/stores/shop";
import { EMPTY_USER, userAtom } from "@/src/stores/user";
import { type AccountDeletionFailureReason, submitAccountDeletionRequest } from "./submitAccountDeletionRequest";
import type { AccountDeletionErrorState, AccountDeletionPreview, AccountDeletionReadyPreview } from "./types";

const ACCEPTED_PAGE_PATH = "/account-deletion-accepted";
const GENERAL_ERROR: AccountDeletionErrorState = {
  message: "アカウントの削除を受け付けられませんでした。\n時間をおいて、もう一度お試しください。",
  showContactLink: true,
};

type ControllerOptions = {
  createRequestId?: () => string;
  currentPreview?: AccountDeletionPreview;
  requiresPreview?: boolean;
  replaceLocation?: (path: string) => void;
  submitRequest?: typeof submitAccountDeletionRequest;
};

export function useAccountDeletionController({
  createRequestId = () => crypto.randomUUID(),
  currentPreview,
  requiresPreview = false,
  replaceLocation = (path) => window.location.replace(path),
  submitRequest = submitAccountDeletionRequest,
}: ControllerOptions = {}) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const setSelectedShop = useSetAtom(selectedShopAtom);
  const setUser = useSetAtom(userAtom);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<AccountDeletionReadyPreview | null>(null);
  const [error, setError] = useState<AccountDeletionErrorState | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const activePreviewRef = useRef<AccountDeletionReadyPreview | null>(null);
  const submissionLockRef = useRef(false);

  const requestWithReverification = useReverification(async (activeRequestId: string) => {
    // 本人確認後の自動再送でも、古いsession tokenを使い回さず毎回取り直す。
    const token = await getToken({ skipCache: true });
    if (!token) {
      return { status: "rejected", reason: "authenticationRequired" } as const;
    }

    const preview = activePreviewRef.current;
    if (preview) {
      return submitRequest({
        requestId: activeRequestId,
        token,
        scope: "accountAndAssociations",
        previewFingerprint: preview.previewFingerprint,
      });
    }

    return submitRequest({ requestId: activeRequestId, token });
  });

  const isPreviewStale = Boolean(
    requiresPreview &&
      activePreview &&
      (currentPreview?.status !== "ready" || currentPreview.previewFingerprint !== activePreview.previewFingerprint),
  );

  const { run, isRunning } = useSingleFlight(async () => {
    const activeRequestId = requestIdRef.current;
    if (!activeRequestId) return;

    setError(null);
    try {
      const result = await requestWithReverification(activeRequestId);
      // SDKのversion差を考慮し、再認証キャンセルのnullも受付成功として扱わない。
      if (result == null) return;

      if (result.status !== "accepted") {
        setError(result.status === "rejected" ? toErrorState(result.reason) : GENERAL_ERROR);
        return;
      }

      setUser(EMPTY_USER);
      setSelectedShop(null);

      try {
        await signOut({ redirectUrl: ACCEPTED_PAGE_PATH });
      } catch {
        // 受付済みならsign-out失敗で認証画面へ戻さず、公開完了画面への遷移を優先する。
      } finally {
        replaceLocation(ACCEPTED_PAGE_PATH);
      }
    } catch (caught) {
      if (isReverificationCancelledError(caught)) return;
      setError(GENERAL_ERROR);
    }
  });

  const open = useCallback(() => {
    if (submissionLockRef.current || requestIdRef.current) return;
    const preview = currentPreview?.status === "ready" ? currentPreview : null;
    if (requiresPreview && !preview) return;

    const nextRequestId = createRequestId();
    requestIdRef.current = nextRequestId;
    activePreviewRef.current = preview;
    setRequestId(nextRequestId);
    setActivePreview(preview);
    setError(null);
  }, [createRequestId, currentPreview, requiresPreview]);

  const close = useCallback(() => {
    if (submissionLockRef.current) return;

    requestIdRef.current = null;
    activePreviewRef.current = null;
    setRequestId(null);
    setActivePreview(null);
    setError(null);
  }, []);

  const submit = useCallback(() => {
    if (!requestIdRef.current || submissionLockRef.current) return;
    if (isPreviewStale) {
      setError(toErrorState("associationChanged"));
      return;
    }

    // Reactの再描画前にcloseと二重submitを止める同期ガード。
    submissionLockRef.current = true;
    void run().finally(() => {
      submissionLockRef.current = false;
    });
  }, [isPreviewStale, run]);

  return {
    isOpen: requestId !== null,
    isRunning,
    isPreviewStale,
    preview: activePreview,
    error,
    open,
    onClose: close,
    onOpenChange: ({ open: nextOpen }: { open: boolean }) => {
      if (nextOpen) open();
      else close();
    },
    onSubmit: submit,
  };
}

function toErrorState(reason: AccountDeletionFailureReason): AccountDeletionErrorState {
  return {
    message: toUserMessage(reason),
    showContactLink: reason === "unexpectedError",
  };
}

function toUserMessage(reason: AccountDeletionFailureReason): string {
  switch (reason) {
    case "invalidRequest":
      return "画面の状態を確認できませんでした。\n画面を更新して、もう一度お試しください。";
    case "authenticationRequired":
      return "ログイン情報を確認できませんでした。\nもう一度ログインしてからお試しください。";
    case "associationChanged":
      return "所属情報が更新されたため、アカウントを削除できません。\n画面を更新して、最新の内容をご確認ください。";
    case "rateLimited":
      return "操作回数が多すぎます。\n時間をおいて、もう一度お試しください。";
    case "unavailable":
      return "現在、アカウントを削除できません。\n時間をおいて、もう一度お試しください。";
    case "networkError":
      return "通信に失敗しました。\n接続を確認して、もう一度お試しください。";
    case "unexpectedError":
      return "アカウントの削除を受け付けられませんでした。\n時間をおいて、もう一度お試しください。";
  }
}
