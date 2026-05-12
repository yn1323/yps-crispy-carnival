import { Box } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { SubmitPageLayout } from "@/src/components/features/StaffSubmit/SubmitPageLayout";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";
import { Empty } from "@/src/components/ui/Empty";

export function StaffShiftSubmitCompletedPage() {
  return (
    <SubmitPageLayout>
      <Box bg="teal.600" w="full">
        <Box maxW={STAFF_CONTENT_MAX_W} mx="auto" px={4} pt={3} pb={4} fontSize="xl" fontWeight="bold" color="white">
          シフト希望を提出
        </Box>
      </Box>

      <Empty
        icon={LuCheck}
        title="提出が完了しました"
        description={"シフト作成担当者からの連絡をお待ちください\nこのページは閉じて大丈夫です"}
        tone="brand"
        iconVariant="circle"
        size="lg"
        flex={1}
        bg="white"
        px={4}
      />
    </SubmitPageLayout>
  );
}
