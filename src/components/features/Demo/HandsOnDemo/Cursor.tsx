import { Box } from "@chakra-ui/react";
import type { CSSProperties } from "react";

const CURSOR_SIZE = 28;
/** 矢印の先端の位置。24分の4、24分の2の位置にある。 */
const CURSOR_TIP = { x: (CURSOR_SIZE * 4) / 24, y: (CURSOR_SIZE * 2) / 24 };

/** 操作の場所を示すマウスのカーソル。先端が置いた点に来るよう、左上へずらして描く。 */
export const Cursor = ({ style }: { style?: CSSProperties }) => (
  <Box
    ml={`${-CURSOR_TIP.x}px`}
    mt={`${-CURSOR_TIP.y}px`}
    w={`${CURSOR_SIZE}px`}
    h={`${CURSOR_SIZE}px`}
    style={{ transformOrigin: `${CURSOR_TIP.x}px ${CURSOR_TIP.y}px`, ...style }}
    aria-hidden
  >
    <svg
      width={CURSOR_SIZE}
      height={CURSOR_SIZE}
      viewBox="0 0 24 24"
      style={{ display: "block", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.3))" }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 2v17l4.1-4 2.6 6 2.6-1.1-2.6-5.9H16z"
        fill="#1a202c"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  </Box>
);

/** カーソルで押したところから広がる輪。`clickKey`が変わるたびに描き直す。 */
export const ClickRipple = ({ clickKey }: { clickKey: number }) => (
  <Box
    key={clickKey}
    position="absolute"
    left="-14px"
    top="-14px"
    boxSize={7}
    borderRadius="full"
    borderWidth="3px"
    borderColor="teal.500"
    pointerEvents="none"
    style={{ animation: "hodRippleOnce .7s ease-out both" }}
    aria-hidden
  />
);
