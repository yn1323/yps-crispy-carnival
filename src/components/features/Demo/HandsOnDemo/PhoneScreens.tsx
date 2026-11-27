import { Box, Flex, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Cursor } from "./Cursor";
import type { ConfirmRow } from "./progress";

/** スマートフォンの枠。中の画面は幅280px、高さ540pxで描き、`scale`で全体を拡大する。 */
export const PHONE_FRAME_SIZE = { width: 300, height: 560 } as const;
export const PHONE_SCREEN_SIZE = { width: 280, height: 540 } as const;

export const PhoneFrame = ({ scale, children }: { scale: number; children: ReactNode }) => (
  <Box
    w={`${PHONE_FRAME_SIZE.width * scale}px`}
    h={`${PHONE_FRAME_SIZE.height * scale}px`}
    flexShrink={0}
    position="relative"
  >
    <Box
      position="absolute"
      top={0}
      left={0}
      w={`${PHONE_FRAME_SIZE.width}px`}
      h={`${PHONE_FRAME_SIZE.height}px`}
      borderRadius="36px"
      bg="gray.900"
      p="10px"
      boxShadow="xl"
      style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
    >
      <Box w="full" h="full" borderRadius="28px" overflow="hidden" bg="white" position="relative">
        {children}
      </Box>
    </Box>
  </Box>
);

/** 押せる場所だと分かるよう、カーソルが近づいてクリックする動きを繰り返す。 */
const TapHint = () => (
  <Box position="absolute" left="70%" top="36%" w={0} h={0} pointerEvents="none" aria-hidden>
    <Box
      position="absolute"
      left="-14px"
      top="-14px"
      boxSize={7}
      borderRadius="full"
      borderWidth="3px"
      borderColor="whiteAlpha.900"
      style={{ animation: "hodTapRipple 2.2s ease-out infinite" }}
    />
    <Cursor style={{ animation: "hodTapHand 2.2s ease-in-out infinite" }} />
  </Box>
);

const LINE_BACKGROUND = "#8aa6c8";
const LINE_HEADER_BACKGROUND = "#7690b3";

/** LINEのトークに届いたお知らせ。文面は製品が送るお知らせと同じにする。 */
const LineChat = ({
  title,
  children,
  cta,
  showsTapHint = false,
}: {
  title: string;
  children: ReactNode;
  cta: string;
  showsTapHint?: boolean;
}) => (
  <Box h="full" bg={LINE_BACKGROUND}>
    <Flex align="center" justify="space-between" px={4} py={3} bg={LINE_HEADER_BACKGROUND} color="white">
      <Text fontSize="sm" fontWeight="bold">
        シフトリ
      </Text>
      <Text fontSize="2xs" fontWeight="bold" px={1.5} py={0.5} borderRadius="sm" bg="green.500">
        LINE
      </Text>
    </Flex>
    <Box px={3} pt={4}>
      <Box bg="white" borderRadius="xl" boxShadow="sm">
        <Box px={4} pt={4} pb={3}>
          <Text fontSize="sm" fontWeight="bold" color="gray.900" whiteSpace="pre-line" lineHeight="1.5">
            {title}
          </Text>
          <Box h="1px" bg="gray.200" my={3} />
          {children}
        </Box>
        <Box borderTopWidth="1px" borderColor="gray.200" px={4} py={3}>
          <Box position="relative">
            <Box
              bg="teal.600"
              color="white"
              borderRadius="md"
              py={2}
              textAlign="center"
              fontSize="xs"
              fontWeight="bold"
            >
              {cta}
            </Box>
            {showsTapHint && <TapHint />}
          </Box>
        </Box>
      </Box>
    </Box>
  </Box>
);

type RecruitProps = {
  shopName: string;
  staffName: string;
  periodLabel: string;
  deadlineLabel: string;
};

/** 募集を開始すると、スタッフに届くお知らせ。 */
export const LineRecruitScreen = ({ shopName, staffName, periodLabel, deadlineLabel }: RecruitProps) => (
  <LineChat title={`${shopName}\n📩 シフト提出のお願い`} cta="希望シフトを提出する" showsTapHint>
    <Text fontSize="xs" color="gray.900">
      {staffName}さん
    </Text>
    <Text fontSize="xs" color="gray.900" mt={1.5}>
      {periodLabel}の希望シフトを提出してください。
    </Text>
    <Text fontSize="xs" fontWeight="bold" color="gray.900" mt={2}>
      提出期限：{deadlineLabel}
    </Text>
    <Text fontSize="2xs" color="gray.500" mt={2}>
      提出後も提出期限まではリンクから訂正が可能です。
    </Text>
  </LineChat>
);

type ConfirmProps = {
  shopName: string;
  staffName: string;
  periodLabel: string;
  rows: ConfirmRow[];
};

const VISIBLE_CONFIRM_ROWS = 6;

/** 確定すると、スタッフに届くお知らせ。その人の勤務を日ごとに並べる。 */
export const LineConfirmScreen = ({ shopName, staffName, periodLabel, rows }: ConfirmProps) => (
  <LineChat title={`${shopName}\n✅ シフト確定`} cta="全員のシフトを確認する">
    <Text fontSize="xs" color="gray.900">
      {staffName}さん
    </Text>
    <Text fontSize="xs" color="gray.900" mt={1.5}>
      {periodLabel}のシフトが確定しました。
    </Text>
    <Text fontSize="xs" fontWeight="bold" color="gray.900" mt={3}>
      ▼あなたのシフト
    </Text>
    <Flex direction="column" gap={1} mt={1.5}>
      {rows.slice(0, VISIBLE_CONFIRM_ROWS).map((row) => (
        <Flex key={row.dateLabel} justify="space-between" fontSize="xs">
          <Text color={row.timeLabel ? "gray.900" : "gray.500"}>{row.dateLabel}</Text>
          <Text fontWeight={row.timeLabel ? "bold" : "normal"} color={row.timeLabel ? "gray.900" : "gray.500"}>
            {row.timeLabel ?? "休み"}
          </Text>
        </Flex>
      ))}
      {rows.length > VISIBLE_CONFIRM_ROWS && (
        <Text fontSize="xs" color="gray.400" textAlign="center" aria-hidden>
          ⋮
        </Text>
      )}
    </Flex>
  </LineChat>
);
