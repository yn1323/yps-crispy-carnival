import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import type { ReactElement } from "react";
import { LuCircleAlert, LuCircleCheck, LuClock } from "react-icons/lu";

export type LineCallbackStatus = "loading" | "ok" | "expired" | "rate_limited" | "error";

type Props = {
  status: LineCallbackStatus;
};

const COPY: Record<
  LineCallbackStatus,
  { icon: ReactElement; iconBg: string; iconFg: string; title: string; description: string }
> = {
  loading: {
    icon: <LuClock />,
    iconBg: "blackAlpha.50",
    iconFg: "gray.500",
    title: "連携中です",
    description: "LINE連携を完了しています...",
  },
  ok: {
    icon: <LuCircleCheck />,
    iconBg: "green.50",
    iconFg: "green.500",
    title: "LINEで通知を受け取れるようになりました",
    description: "シフト確定や提出依頼がLINEに届きます。このページは閉じて構いません。",
  },
  expired: {
    icon: <LuClock />,
    iconBg: "orange.50",
    iconFg: "orange.500",
    title: "リンクの有効期限が切れています",
    description: "店長に再発行を依頼してください。1つのリンクは72時間以内・1回のみ使えます。",
  },
  rate_limited: {
    icon: <LuCircleAlert />,
    iconBg: "orange.50",
    iconFg: "orange.500",
    title: "アクセスが集中しています",
    description: "少し時間を空けてから再度お試しください。",
  },
  error: {
    icon: <LuCircleAlert />,
    iconBg: "red.50",
    iconFg: "red.500",
    title: "連携に失敗しました",
    description: "通信エラーが発生しました。時間を置いて再度お試しください。",
  },
};

export const LineCallbackPage = ({ status }: Props) => {
  const c = COPY[status];
  return (
    <Stack align="center" gap={5} py={16} px={6} textAlign="center">
      <Box
        boxSize="64px"
        borderRadius="full"
        bg={c.iconBg}
        color={c.iconFg}
        fontSize="32px"
        display="grid"
        placeItems="center"
      >
        {c.icon}
      </Box>
      <Stack gap={2}>
        <Heading as="h1" fontSize="lg" color="gray.900">
          {c.title}
        </Heading>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall" maxW="380px">
          {c.description}
        </Text>
      </Stack>
    </Stack>
  );
};
