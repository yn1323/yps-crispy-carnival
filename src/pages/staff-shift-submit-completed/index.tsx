import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { LuArrowLeft, LuCheck } from "react-icons/lu";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";

type Props = {
  shopName?: string;
};

export function StaffShiftSubmitCompletedPage({ shopName = "シフト提出" }: Props) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <StaffLayout shopName={shopName}>
      <StaffCenteredContent>
        <Empty
          icon={LuCheck}
          title="提出が完了しました"
          description={"シフト作成担当者からの連絡をお待ちください\nこのページは閉じて大丈夫です"}
          tone="brand"
          iconVariant="circle"
          size="lg"
          bg="white"
          px={4}
          action={
            canGoBack ? (
              <Button
                variant="outline"
                colorPalette="teal"
                size="md"
                borderRadius="lg"
                px={6}
                onClick={() => router.history.back()}
              >
                <LuArrowLeft />
                シフト提出画面に戻る
              </Button>
            ) : undefined
          }
        />
      </StaffCenteredContent>
    </StaffLayout>
  );
}
