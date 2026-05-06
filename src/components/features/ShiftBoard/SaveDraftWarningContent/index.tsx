import { Stack, Text } from "@chakra-ui/react";

export const SaveDraftWarningContent = () => {
  return (
    <Stack gap={3} fontSize="sm" lineHeight="tall">
      <Text>下書き保存のあとに届いた希望は、自動ではシフト表に入りません。</Text>
      <Text>あとから届いた希望は、シフト表を見ながら手動で追加してください。</Text>
      <Text>下書き保存しますか？</Text>
    </Stack>
  );
};
