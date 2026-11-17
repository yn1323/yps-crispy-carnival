import { useBreakpointValue } from "@chakra-ui/react";
import type { StaffingCountBandLayout } from "./script";

/**
 * 帯の出し方を、画面の幅から決める。使う側が指定した場合は、その値を使う。
 * wideは幅1024px以上、narrowはそれより狭い画面にあたる。
 */
export const useBandLayout = (override?: StaffingCountBandLayout): StaffingCountBandLayout => {
  // この部品はブラウザだけで描画する。最初の描画から正しい出し方にするため、画面の幅をその場で読む。
  const autoLayout =
    useBreakpointValue<StaffingCountBandLayout>({ base: "narrow", lg: "wide" }, { ssr: false }) ?? "wide";
  return override ?? autoLayout;
};
