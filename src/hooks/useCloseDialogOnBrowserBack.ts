import { type RouterHistory, useRouter } from "@tanstack/react-router";
import { type MutableRefObject, useEffect, useRef } from "react";

const DIALOG_BACK_GUARD_KEY = "__shiftoriDialogBackGuard";

type OpenDialog = {
  history: RouterHistory;
  id: symbol;
  onCloseRef: MutableRefObject<() => void>;
};

type DialogBackGuard = {
  history: RouterHistory;
  id: string;
};

// Dialogの表示順はReact treeと一致しない場合があるため、開いた順を明示的に保持する。
const openDialogs: OpenDialog[] = [];
const registeredHistories = new WeakSet<RouterHistory>();
let backGuard: DialogBackGuard | undefined;
let removeBackGuardTimer: number | undefined;

const isCurrentBackGuard = (history: RouterHistory, guard: DialogBackGuard) =>
  (history.location.state as unknown as Record<string, unknown>)[DIALOG_BACK_GUARD_KEY] === guard.id;

const clearScheduledBackGuardRemoval = () => {
  if (removeBackGuardTimer === undefined) return;
  window.clearTimeout(removeBackGuardTimer);
  removeBackGuardTimer = undefined;
};

const removeBackGuard = (guard: DialogBackGuard) => {
  if (backGuard !== guard || !isCurrentBackGuard(guard.history, guard)) return;
  backGuard = undefined;
  guard.history.back({ ignoreBlocker: true });
};

const scheduleBackGuardRemoval = (guard: DialogBackGuard) => {
  clearScheduledBackGuardRemoval();
  removeBackGuardTimer = window.setTimeout(() => {
    removeBackGuardTimer = undefined;
    if (openDialogs.length === 0) removeBackGuard(guard);
  }, 0);
};

const removeBackGuardAfterRollback = (guard: DialogBackGuard) => {
  window.addEventListener(
    "popstate",
    () => {
      if (openDialogs.length === 0) removeBackGuard(guard);
    },
    { once: true },
  );
};

/**
 * Dialog用blockerを他の画面離脱blockerより先に登録する。
 * アプリ起動時に一度呼び、ブラウザ戻るでは最前面のDialogだけを閉じる。
 */
export const registerDialogBackNavigation = (history: RouterHistory) => {
  if (registeredHistories.has(history)) return;
  registeredHistories.add(history);

  history.block({
    enableBeforeUnload: false,
    blockerFn: ({ action }) => {
      if (action !== "BACK") return false;

      const dialogIndex = openDialogs.findLastIndex((dialog) => dialog.history === history);
      if (dialogIndex === -1) return false;

      const [dialog] = openDialogs.splice(dialogIndex, 1);
      dialog?.onCloseRef.current();

      const guard = backGuard;
      if (guard?.history === history && openDialogs.length === 0) {
        // TanStack HistoryがblockしたBACKを現在位置へ戻した後、guardだけをblockerなしで取り除く。
        removeBackGuardAfterRollback(guard);
      }
      return true;
    },
  });
};

const addBackGuard = (history: RouterHistory) => {
  if (backGuard?.history === history) return;

  const id = crypto.randomUUID();
  backGuard = { history, id };
  history.push(
    history.location.href,
    {
      ...history.location.state,
      [DIALOG_BACK_GUARD_KEY]: id,
    },
    { ignoreBlocker: true },
  );
  // 戻る操作が直後に行われても、同一document内の履歴entryを確実に用意しておく。
  history.flush();
};

/**
 * Dialog表示中のブラウザ戻るを、ページ遷移ではなくDialogを閉じる操作として扱う。
 * 進むやアプリ内遷移は妨げない。
 * StorybookやテストなどRouter外の描画では何もしない。
 */
export const useCloseDialogOnBrowserBack = (isOpen: boolean, onClose: () => void) => {
  const router = useRouter({ warn: false }) as ReturnType<typeof useRouter> | undefined;
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !router) return;

    clearScheduledBackGuardRemoval();
    registerDialogBackNavigation(router.history);

    const dialog: OpenDialog = {
      history: router.history,
      id: Symbol("dialog"),
      onCloseRef,
    };
    openDialogs.push(dialog);
    addBackGuard(router.history);

    return () => {
      const index = openDialogs.findIndex(({ id }) => id === dialog.id);
      if (index === -1) return;

      openDialogs.splice(index, 1);
      const guard = backGuard;
      if (openDialogs.length === 0 && guard && guard.history === router.history) {
        // StrictModeのeffect再実行では、直後の再登録がこの削除を取り消す。
        scheduleBackGuardRemoval(guard);
      }
    };
  }, [isOpen, router]);
};
