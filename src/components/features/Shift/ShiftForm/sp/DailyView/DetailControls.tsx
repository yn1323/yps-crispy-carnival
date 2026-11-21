import { Box, Presence } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { useRef } from "react";
import { detailModeAtom, selectedDayFulfillmentViewAtom } from "../../stores";
import { SP_DATE_HEADING_HEIGHT_PX } from "./DateRail";
import { FulfillmentSection } from "./FulfillmentSection";

/**
 * くわしく表示で、日付の見出しのすぐ下に置く充足。
 * ポジションと休憩は編集シートで選ぶため、この画面には入れるものの行を置かない。
 * くわしく表示へ切り替えると上から下りてきて、シンプル表示へ戻すと上へ戻って消える。
 * 開いているかどうかにかかわらず、一覧をスクロールしても、日付の見出しのすぐ下に留まる。
 * この画面は日付の一覧ごと外側の入れ物でスクロールするため、一覧の入れ物の外に置く。
 */
export const DetailControls = () => {
  const detailMode = useAtomValue(detailModeAtom);
  const fulfillmentView = useAtomValue(selectedDayFulfillmentViewAtom);
  // シンプル表示へ切り替えたあとも、上へ消えきるまでは直前の中身を出す。
  const lastFulfillmentViewRef = useRef(fulfillmentView);
  if (detailMode) lastFulfillmentViewRef.current = fulfillmentView;

  return (
    // 枠の上へ出た中身を切り取り、日付の見出しの下から出入りして見せる。
    <Box
      position="sticky"
      // 上端に留まる日付の見出しのすぐ下に留める。
      top={`${SP_DATE_HEADING_HEIGHT_PX}px`}
      zIndex={2}
      overflow="clip"
      flexShrink={0}
    >
      <Presence
        present={detailMode && fulfillmentView !== null}
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
        <FulfillmentSection view={lastFulfillmentViewRef.current} />
      </Presence>
    </Box>
  );
};
