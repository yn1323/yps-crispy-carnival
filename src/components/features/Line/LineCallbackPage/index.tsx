import type { ElementType } from "react";
import { LuCircleAlert, LuCircleCheck, LuClock } from "react-icons/lu";
import { StaffCenteredContent } from "@/src/components/templates/StaffLayout";
import { Empty } from "@/src/components/ui/Empty";

export type LineCallbackStatus = "loading" | "ok" | "needs_follow" | "expired" | "rate_limited" | "error";

type Props = {
  status: LineCallbackStatus;
};

const COPY: Record<
  LineCallbackStatus,
  { icon: ElementType; tone: "neutral" | "success" | "warning" | "danger"; title: string; description: string }
> = {
  loading: {
    icon: LuClock,
    tone: "neutral",
    title: "連携中です",
    description: "LINE連携を確認しています",
  },
  ok: {
    icon: LuCircleCheck,
    tone: "success",
    title: "シフト通知をLINEで受け取れます",
    description: "シフト確定や提出依頼がLINEに届きます。このページは閉じて構いません。",
  },
  needs_follow: {
    icon: LuCircleAlert,
    tone: "warning",
    title: "LINE連携は完了しました",
    description:
      "シフト通知をLINEで受け取るには、シフトリ公式アカウントを友だち追加してください。友だち追加後、募集中のシフトがある場合はLINEで案内します。",
  },
  expired: {
    icon: LuClock,
    tone: "warning",
    title: "リンクの有効期限が切れています",
    description: "シフト作成担当者にリンクをもう一度送ってもらってください。このリンクは72時間以内に1回だけ使えます。",
  },
  rate_limited: {
    icon: LuCircleAlert,
    tone: "warning",
    title: "アクセスが集中しています",
    description: "少し時間を空けてから再度お試しください。",
  },
  error: {
    icon: LuCircleAlert,
    tone: "danger",
    title: "LINE連携を完了できませんでした",
    description: "通信が切れた可能性があります。少し待ってからもう一度お試しください。",
  },
};

export const LineCallbackPage = ({ status }: Props) => {
  const c = COPY[status];
  return (
    <StaffCenteredContent>
      <Empty icon={c.icon} title={c.title} description={c.description} tone={c.tone} iconVariant="circle" />
    </StaffCenteredContent>
  );
};
