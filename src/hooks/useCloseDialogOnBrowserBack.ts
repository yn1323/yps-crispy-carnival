import { type BlockerFn, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

// 開いているDialogの重なり順。ブラウザ戻るでは最前面のDialogだけを閉じる。
const openDialogStack: symbol[] = [];

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

    const dialogId = Symbol("dialog");
    openDialogStack.push(dialogId);

    const blockerFn: BlockerFn = ({ action }) => {
      if (action !== "BACK") return false;
      // 最前面でないDialogは判定を後続のblockerへ委ね、重なり順の上から一つずつ閉じる
      if (openDialogStack[openDialogStack.length - 1] !== dialogId) return false;
      onCloseRef.current();
      return true;
    };
    const unblock = router.history.block({ blockerFn, enableBeforeUnload: false });

    return () => {
      const index = openDialogStack.indexOf(dialogId);
      if (index !== -1) openDialogStack.splice(index, 1);
      unblock();
    };
  }, [isOpen, router]);
};
