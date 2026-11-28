import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type AppHeaderVisibility = {
  /** 画面の内側のスクロールによって、アプリのヘッダーを隠しているか。 */
  isHiddenByContent: boolean;
  /** 画面の内側でスクロールする画面が、ヘッダーを隠す・表示するを伝える。 */
  setHiddenByContent: (isHidden: boolean) => void;
};

const AppHeaderVisibilityContext = createContext<AppHeaderVisibility>({
  isHiddenByContent: false,
  setHiddenByContent: () => {},
});

/**
 * アプリのヘッダーは、ページのスクロールでは自分で隠れる。
 * シフト表のように画面の内側の入れ物でスクロールする画面は、ここへ伝えてヘッダーを隠してもらう。
 */
export function AppHeaderVisibilityProvider({ children }: { children: ReactNode }) {
  const [isHiddenByContent, setHiddenByContent] = useState(false);
  const value = useMemo(() => ({ isHiddenByContent, setHiddenByContent }), [isHiddenByContent]);
  return <AppHeaderVisibilityContext.Provider value={value}>{children}</AppHeaderVisibilityContext.Provider>;
}

export const useAppHeaderVisibility = () => useContext(AppHeaderVisibilityContext);
