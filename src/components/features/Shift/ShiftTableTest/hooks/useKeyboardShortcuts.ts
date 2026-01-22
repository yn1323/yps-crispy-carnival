import { useEffect } from "react";

type KeyboardShortcutHandlers = {
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
};

export const useKeyboardShortcuts = (handlers: KeyboardShortcutHandlers): void => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力欄フォーカス中は無効化
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Ctrl（Windows）またはCmd（Mac）キーが押されているか
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handlers.onUndo();
      } else if (isCtrlOrCmd && e.key === "y") {
        e.preventDefault();
        handlers.onRedo();
      } else if (isCtrlOrCmd && e.key === "z" && e.shiftKey) {
        // Cmd+Shift+Z（Mac）もRedo
        e.preventDefault();
        handlers.onRedo();
      } else if (isCtrlOrCmd && e.key === "c") {
        e.preventDefault();
        handlers.onCopy();
      } else if (isCtrlOrCmd && e.key === "v") {
        e.preventDefault();
        handlers.onPaste();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handlers]);
};
