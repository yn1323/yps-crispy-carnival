import { useBreakpointValue, useMediaQuery } from "@chakra-ui/react";
import type { StaffingBarLayout } from "./script";

/**
 * バーの表の出し方を、画面の幅と操作の方法から決める。
 * layout は幅だけで決め、バーの表と「できあがる必要人数」で同じ値になる。
 * isTouch は、指で操作する画面として扱うかどうか。狭い画面と、指で操作する端末（広い画面のタブレットなど）で真になる。
 */
export const useStaffingBarLayout = (override?: StaffingBarLayout) => {
  // この部品はブラウザだけで描画する。最初の描画から正しい出し方にするため、画面の幅をその場で読む。
  const autoLayout = useBreakpointValue<StaffingBarLayout>({ base: "narrow", lg: "wide" }, { ssr: false }) ?? "wide";
  const [isCoarsePointer] = useMediaQuery(["(pointer: coarse)"], { ssr: false });
  const layout = override ?? autoLayout;
  return { layout, isTouch: layout === "narrow" || isCoarsePointer };
};
