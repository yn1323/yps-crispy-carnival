import { Box, Presence } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import { ToolPalette } from "../../detailParts";
import { DayTemplateMenu, useDayStaffingView } from "../../staffingParts";
import {
  detailModeAtom,
  isFulfillmentExpandedAtom,
  isToolPaletteActiveAtom,
  selectedDateAtom,
  selectedDayFulfillmentViewAtom,
} from "../../stores";
import { SP_DATE_HEADING_HEIGHT_PX } from "./DateRail";
import { FulfillmentSection } from "./FulfillmentSection";

/**
 * くわしく表示で、日付の見出しのすぐ下に置く、入れるものの行と充足。
 * くわしく表示へ切り替えると上から下りてきて、シンプル表示へ戻すと上へ戻って消える。
 * 充足を閉じている間は、一覧をスクロールしても、日付の見出しのすぐ下に留まる。開いている間は、一覧と一緒にスクロールする。
 * この画面は日付の一覧ごと外側の入れ物でスクロールするため、一覧の入れ物の外に置く。
 */
export const DetailControls = () => {
  const detailMode = useAtomValue(detailModeAtom);
  const isPaletteActive = useAtomValue(isToolPaletteActiveAtom);
  const fulfillmentView = useAtomValue(selectedDayFulfillmentViewAtom);
  const isFulfillmentExpanded = useAtomValue(isFulfillmentExpandedAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  // その日のテンプレート。入れるものの行の左端に置く。くわしく表示の営業日だけ値が入る。
  const staffingView = useDayStaffingView(selectedDate);
  // シンプル表示へ切り替えたあとも、上へ消えきるまでは直前の中身を出す。
  const lastContentRef = useRef({ isPaletteActive, fulfillmentView, staffingView });
  if (detailMode) lastContentRef.current = { isPaletteActive, fulfillmentView, staffingView };
  const content = lastContentRef.current;

  return (
    // 枠の上へ出た中身を切り取り、日付の見出しの下から出入りして見せる。
    <Box
      position={isFulfillmentExpanded ? "static" : "sticky"}
      // 上端に留まる日付の見出しのすぐ下に留める。
      top={`${SP_DATE_HEADING_HEIGHT_PX}px`}
      zIndex={2}
      overflow="clip"
      flexShrink={0}
    >
      <Presence
        present={detailMode && (isPaletteActive || fulfillmentView !== null)}
        lazyMount
        unmountOnExit
        // 開いた時点でくわしく表示の画面と、日付を変えたときは、動かさずに出す。
        skipAnimationOnMount
        _open={{
          animationName: "slide-from-top-full",
          animationDuration: "moderate",
          animationTimingFunction: "ease-out",
        }}
        _closed={{
          animationName: "slide-to-top-full",
          animationDuration: "moderate",
          animationTimingFunction: "ease-in",
        }}
        _motionReduce={{ animation: "none" }}
      >
        {/* 設定は、テンプレートのメニューの「シフト作成の設定を開く」から開けるため、この行には出さない。 */}
        <ToolPalette
          active={content.isPaletteActive}
          hidesSetup
          leading={content.staffingView && <DayTemplateMenu date={selectedDate} view={content.staffingView} />}
        />
        <FulfillmentSection view={content.fulfillmentView} />
      </Presence>
    </Box>
  );
};
