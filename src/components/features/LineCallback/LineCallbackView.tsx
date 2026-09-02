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
    title: "シフトリ公式アカウントを友達に追加してください。",
    description:
      "シフトリの設定が完了しましたが、通知が届かない状態になっています。\nシフト通知をLINEで受け取るには、シフトリ公式アカウントを友だち追加してください。",
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

export const LineCallbackView = ({ status }: Props) => {
  const c = COPY[status];
  return (
    <StaffCenteredContent>
      <Empty icon={c.icon} title={c.title} description={c.description} tone={c.tone} iconVariant="circle" />
    </StaffCenteredContent>
  );
};
