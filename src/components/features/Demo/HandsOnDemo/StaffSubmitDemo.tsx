import { Box, Portal } from "@chakra-ui/react";
import { useCallback, useMemo, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { ShiftSubmitPage } from "@/src/components/features/StaffSubmit";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Empty } from "@/src/components/ui/Empty";
import { isValidIsoDateString } from "@/src/domains/shift/date";
import { ClickRipple, Cursor } from "./Cursor";
import { HANDS_ON_KEYFRAMES } from "./motion";
import {
  buildHandsOnScenario,
  buildStaffSubmissionData,
  getHandsOnPeriodStart,
  HANDS_ON_SHOP_NAME,
  SATO_REQUEST_DAY_INDEXES,
  SATO_REQUEST_TIME,
} from "./scenario";
import { HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE } from "./staffSubmitEmbed";
import { type PlayerCursor, useStaffSubmitPlayer } from "./useStaffSubmitPlayer";

/** 佐藤さんがメモに書く内容。希望の終わりの22時より少し残れることを伝える。 */
const SATO_NOTE = "22時以降も少しなら残れます";

const PlayerCursorOverlay = ({ cursor }: { cursor: PlayerCursor }) => (
  <Portal>
    <Box position="fixed" inset={0} zIndex={2000} pointerEvents="none" aria-hidden>
      <Box
        position="absolute"
        left={0}
        top={0}
        style={{
          transform: `translate(${cursor.x}px, ${cursor.y}px)`,
          transition: `transform ${cursor.moveMs}ms ease-in-out`,
        }}
      >
        {cursor.clickKey > 0 && <ClickRipple clickKey={cursor.clickKey} />}
        <Cursor style={{ transform: cursor.pressed ? "scale(.85)" : "none", transition: "transform .08s" }} />
      </Box>
    </Box>
  </Portal>
);

const notifyFinished = () => {
  if (window.parent === window) return;
  window.parent.postMessage({ type: HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE }, window.location.origin);
};

/**
 * 体験デモのスマートフォンの枠に読み込む、スタッフ（佐藤さん）の提出画面。
 * 本物の提出画面を自動で操作し、選択欄で時刻を選び直し、メモを書いて提出する。保存はしない。
 */
export const HandsOnStaffSubmitDemo = ({ periodStart }: { periodStart?: string }) => {
  // 読み込む側が渡した初日が日付でなければ、体験デモと同じく次の月曜から始める。
  const start = periodStart && isValidIsoDateString(periodStart) ? periodStart : getHandsOnPeriodStart();
  const scenario = useMemo(() => buildHandsOnScenario(start), [start]);
  const data = useMemo(() => buildStaffSubmissionData(scenario), [scenario]);
  const plan = useMemo(
    () => ({
      dates: SATO_REQUEST_DAY_INDEXES.map((index) => scenario.dates[index]),
      startTime: SATO_REQUEST_TIME.start,
      endTime: SATO_REQUEST_TIME.end,
      noteDate: scenario.dates[SATO_REQUEST_DAY_INDEXES[SATO_REQUEST_DAY_INDEXES.length - 1]],
      note: SATO_NOTE,
    }),
    [scenario],
  );
  const [submitted, setSubmitted] = useState(false);
  const cursor = useStaffSubmitPlayer({ plan, onFinished: notifyFinished });
  const handleSubmit = useCallback(async () => {
    setSubmitted(true);
  }, []);

  return (
    <Box minH="100dvh" bg="gray.50">
      <style>{HANDS_ON_KEYFRAMES}</style>
      {submitted ? (
        <Box style={{ animation: "hodFadeUp .45s ease-out both" }}>
          <StaffLayout shopName={HANDS_ON_SHOP_NAME}>
            <StaffCenteredContent>
              <Empty
                icon={LuCheck}
                title="提出が完了しました"
                description={"シフト確定をお待ちください。\nこのページは閉じて構いません。"}
                tone="brand"
                iconVariant="circle"
                size="lg"
                bg="white"
                px={4}
              />
            </StaffCenteredContent>
          </StaffLayout>
        </Box>
      ) : (
        <ShiftSubmitPage data={data} onSubmit={handleSubmit} />
      )}
      {cursor && <PlayerCursorOverlay cursor={cursor} />}
    </Box>
  );
};
