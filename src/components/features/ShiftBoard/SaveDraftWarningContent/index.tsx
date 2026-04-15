import { Stack, Text } from "@chakra-ui/react";

export const SaveDraftWarningContent = () => {
  return (
    <Stack gap={3} fontSize="sm" lineHeight="tall">
      <Text>一時保存後に提出されたシフトは、シフト予定（青いバー）が自動で設定されません。</Text>
      <Text>以降提出されたシフトは手動でシフト予定時間を設定してください。</Text>
      <Text>※スタッフの希望シフト（黒い点線）は、引き続き設定されます。</Text>
    </Stack>
  );
};
