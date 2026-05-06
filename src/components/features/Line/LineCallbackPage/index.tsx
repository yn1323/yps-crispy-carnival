import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import type { ReactElement } from "react";
import { LuCircleAlert, LuCircleCheck, LuClock } from "react-icons/lu";
import { StaffCenteredContent } from "@/src/components/templates/StaffLayout";

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
    description: "LINE連携を確認しています",
  },
  ok: {
    icon: <LuCircleCheck />,
    iconBg: "green.50",
    iconFg: "green.500",
    title: "シフト通知をLINEで受け取れます",
    description: "シフト確定や提出依頼がLINEに届きます。このページは閉じて構いません。",
  },
  expired: {
    icon: <LuClock />,
    iconBg: "orange.50",
    iconFg: "orange.500",
    title: "リンクの有効期限が切れています",
    description: "シフト作成担当者にリンクをもう一度送ってもらってください。このリンクは72時間以内に1回だけ使えます。",
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
    title: "LINE連携を完了できませんでした",
    description: "通信が切れた可能性があります。少し待ってからもう一度お試しください。",
  },
};

export const LineCallbackPage = ({ status }: Props) => {
  const c = COPY[status];
  return (
    <StaffCenteredContent gap={5} textAlign="center">
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
    </StaffCenteredContent>
  );
};
