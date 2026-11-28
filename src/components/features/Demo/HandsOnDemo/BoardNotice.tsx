import { Flex, Icon, Text } from "@chakra-ui/react";
import type { IconType } from "react-icons";
import { LuMousePointerClick, LuPartyPopper } from "react-icons/lu";

/**
 * シフト表の上に数秒だけ出す知らせ。
 * ready：自動で進む場面から、利用者が操作する場面へ変わったことを示す。
 * praise：案内どおりに佐藤さんの勤務を入れたことを褒める。画面全体は覆わない。
 */
export type BoardNoticeKind = "ready" | "praise";

const NOTICES: Record<BoardNoticeKind, { label: string; icon: IconType; bg: string; animation: string }> = {
  ready: {
    label: "ここから操作できます",
    icon: LuMousePointerClick,
    bg: "teal.600",
    animation: "hodFadeUp .35s ease-out both",
  },
  praise: {
    label: "佐藤さんのシフトを設定しました！",
    icon: LuPartyPopper,
    bg: "green.600",
    animation: "hodPop .45s ease-out both",
  },
};

/** 知らせを出しておく時間（ミリ秒）。 */
export const BOARD_NOTICE_MS: Record<BoardNoticeKind, number> = { ready: 4000, praise: 3000 };
/** 知らせが消えていく時間（ミリ秒）。 */
export const BOARD_NOTICE_LEAVE_MS = 400;

/** シフト表の上に数秒だけ出す知らせ。`leaving`で消えていく。 */
export const BoardNotice = ({ kind, leaving }: { kind: BoardNoticeKind; leaving: boolean }) => {
  const notice = NOTICES[kind];
  return (
    <Flex
      role="status"
      align="center"
      gap={2}
      pl={3.5}
      pr={4}
      py={2}
      borderRadius="full"
      bg={notice.bg}
      color="white"
      fontSize="sm"
      fontWeight="bold"
      whiteSpace="nowrap"
      boxShadow="0 8px 20px rgba(0, 0, 0, .18)"
      pointerEvents="none"
      style={{ animation: leaving ? "hodFadeOut .4s ease-in both" : notice.animation }}
    >
      <Icon as={notice.icon} boxSize={4} aria-hidden />
      <Text>{notice.label}</Text>
    </Flex>
  );
};
