import { LuCheck } from "react-icons/lu";
import { StaffCenteredContent, StaffLayout } from "@/src/components/templates/StaffLayout";
import { Empty } from "@/src/components/ui/Empty";

type Props = {
  shopName?: string;
};

export function StaffShiftSubmitCompletedPage({ shopName = "シフト提出" }: Props) {
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
        />
      </StaffCenteredContent>
    </StaffLayout>
  );
}
