import { Box } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { chromeVisibilityAtom } from "./stores";

/**
 * シフト表の内側を下へスクロールしている間、高さを0へ縮めて隠す行。
 * 上の行（戻る、日別と一覧、保存）と、スマートフォンの日付の一覧で使う。
 * 日付の一覧は表の途中で上へ戻すと表示し、上の行は上端へ来るまで隠したままにする（スマートフォン）。
 * 隠している間は、中のボタンへフォーカスが移らないようにする。
 */
export const ChromeCollapse = ({ children, isChromeRow = false }: { children: ReactNode; isChromeRow?: boolean }) => {
  const visibility = useAtomValue(chromeVisibilityAtom);
  const isHidden = isChromeRow ? visibility !== "shown" : visibility === "hidden";
  return (
    <Box
      display="grid"
      gridTemplateRows={isHidden ? "0fr" : "1fr"}
      transition="grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
      _motionReduce={{ transition: "none" }}
      flexShrink={0}
      data-chrome-row={isChromeRow ? "" : undefined}
      data-chrome-collapse=""
      data-chrome-hidden={isHidden ? "" : undefined}
      inert={isHidden}
    >
      <Box minH={0} overflow="hidden">
        {children}
      </Box>
    </Box>
  );
};
