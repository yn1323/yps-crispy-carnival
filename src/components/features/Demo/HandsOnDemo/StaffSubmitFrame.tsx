import { Box, chakra } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { PHONE_SCREEN_SIZE } from "./PhoneScreens";
import { buildStaffSubmitSrc, HANDS_ON_STAFF_SUBMIT_VIEWPORT, isStaffSubmitDoneMessage } from "./staffSubmitEmbed";

type Props = {
  periodStart: string;
  /** 枠の中で、スタッフが提出まで終えた。 */
  onDone: () => void;
};

const SCALE = PHONE_SCREEN_SIZE.width / HANDS_ON_STAFF_SUBMIT_VIEWPORT.width;

/** スマートフォンの枠の中に、本物の提出画面を読み込む。中の操作は自動で進むため、利用者は触れない。 */
export const StaffSubmitFrame = ({ periodStart, onDone }: Props) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // 同じoriginで、このiframeから届いた知らせだけを受け取る。
      if (event.origin !== window.location.origin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isStaffSubmitDoneMessage(event.data)) return;
      onDone();
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onDone]);

  return (
    <Box position="absolute" inset={0} overflow="hidden" bg="gray.50" pointerEvents="none">
      <chakra.iframe
        ref={frameRef}
        src={buildStaffSubmitSrc(periodStart)}
        title="スタッフが希望を出す画面"
        tabIndex={-1}
        border={0}
        display="block"
        width={`${HANDS_ON_STAFF_SUBMIT_VIEWPORT.width}px`}
        height={`${HANDS_ON_STAFF_SUBMIT_VIEWPORT.height}px`}
        style={{ transform: `scale(${SCALE})`, transformOrigin: "top left" }}
      />
    </Box>
  );
};
