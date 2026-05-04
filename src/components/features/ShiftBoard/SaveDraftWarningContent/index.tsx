import { Stack, Text } from "@chakra-ui/react";

export const SaveDraftWarningContent = () => {
  return (
    <Stack gap={3} fontSize="sm" lineHeight="tall">
      <Text>一時保存後に提出されたシフトは、勤務予定が自動で設定されません。</Text>
      <Text>以降は希望シフトを見ながら手動でシフト設定することになります。</Text>
      <Text>よろしいですか？</Text>
    </Stack>
  );
};
