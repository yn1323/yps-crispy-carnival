import { Stack, Text } from "@chakra-ui/react";
import type { ElementType } from "react";
import { LuCircleAlert, LuCircleCheck, LuClock, LuExternalLink } from "react-icons/lu";
import { StaffCenteredContent } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

export type LineCallbackStatus = "loading" | "ok" | "needs_follow" | "expired" | "rate_limited" | "error";

type Props = {
  status: LineCallbackStatus;
  officialAccountUrl?: string;
};

const COPY: Record<
  LineCallbackStatus,
  { icon: ElementType; tone: "neutral" | "success" | "warning" | "danger"; title: string; description: string }
> = {
  loading: {
    icon: LuClock,
    tone: "neutral",
    title: "LINE連携中です",
    description: "そのままページを開いたままお待ちください。",
  },
  ok: {
    icon: LuCircleCheck,
    tone: "success",
    title: "LINE連携が完了しました。",
    description: "シフトや募集依頼がLINEに届きます。\nこのページは閉じて構いません。",
  },
  needs_follow: {
    icon: LuCircleAlert,
    tone: "warning",
    title: "LINE通知を受け取るには",
    description:
      "LINEアカウントとの連携は完了しました。\nシフトリ公式アカウントを友だち追加してください。\nブロックしている場合は、ブロックを解除してください。",
  },
  expired: {
    icon: LuClock,
    tone: "warning",
    title: "リンクが無効です",
    description: "シフト作成担当者に新しいLINE連携リンクの発行を依頼してください。",
  },
  rate_limited: {
    icon: LuCircleAlert,
    tone: "warning",
    title: "アクセスが集中しています",
    description: "少し時間をおいてから、再度お試しください。",
  },
  error: {
    icon: LuCircleAlert,
    tone: "danger",
    title: "LINE連携を完了できませんでした",
    description: "ネットワークエラー。\n少し待ってから、再度お試しください。",
  },
};

export const LineCallbackView = ({ status, officialAccountUrl }: Props) => {
  const c = COPY[status];
  return (
    <StaffCenteredContent>
      <Empty
        icon={c.icon}
        title={c.title}
        description={c.description}
        tone={c.tone}
        iconVariant="circle"
        action={
          status === "needs_follow" ? (
            <Stack gap={3} align="center" w="full">
              {officialAccountUrl ? (
                <>
                  <Button asChild colorPalette="teal" minH="44px">
                    <a href={officialAccountUrl} target="_blank" rel="noopener noreferrer">
                      公式アカウントを開く
                      <LuExternalLink aria-hidden />
                    </a>
                  </Button>
                  <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                    友だち追加・ブロック解除後は、このページを閉じて構いません。
                  </Text>
                </>
              ) : (
                <Text fontSize="sm" color="fg.muted" lineHeight="tall">
                  シフト作成担当者に公式アカウントのURLを確認してください。
                </Text>
              )}
            </Stack>
          ) : undefined
        }
      />
    </StaffCenteredContent>
  );
};
