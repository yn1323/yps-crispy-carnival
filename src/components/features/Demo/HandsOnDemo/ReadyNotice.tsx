import { Flex, Icon, Text } from "@chakra-ui/react";
import { LuMousePointerClick } from "react-icons/lu";

/** シフト表で操作できるようになったときの知らせ。自動で進む場面から、利用者が操作する場面へ変わったことを示す。 */
const READY_NOTICE_LABEL = "ここから操作できます";

/** シフト表で操作できるようになったことを、数秒だけ知らせる。`leaving`で消えていく。 */
export const ReadyNotice = ({ leaving }: { leaving: boolean }) => (
  <Flex
    role="status"
    align="center"
    gap={2}
    pl={3.5}
    pr={4}
    py={2}
    borderRadius="full"
    bg="teal.600"
    color="white"
    fontSize="sm"
    fontWeight="bold"
    whiteSpace="nowrap"
    boxShadow="0 8px 20px rgba(13, 148, 136, .35)"
    pointerEvents="none"
    style={{ animation: leaving ? "hodFadeOut .4s ease-in both" : "hodFadeUp .35s ease-out both" }}
  >
    <Icon as={LuMousePointerClick} boxSize={4} aria-hidden />
    <Text>{READY_NOTICE_LABEL}</Text>
  </Flex>
);
