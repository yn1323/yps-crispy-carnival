import { Stack, Text } from "@chakra-ui/react";

export const SaveDraftWarningContent = () => {
  return (
    <Stack gap={3} fontSize="sm" lineHeight="tall">
      <Text>
        ここまでは希望シフトに合わせて
        <br />
        青いバー（割当）が自動で置かれます
      </Text>
      <Text>
        一時保存のあとに新しく提出されたシフト希望は
        <br />
        青いバーが自動では置かれません
      </Text>
      <Text>
        新規提出されたシフトも
        <br />
        黒い枠線で確認できます
      </Text>
      <Text>
        あとから引くときは
        <br />
        枠線を見ながら手動で作ってください
      </Text>
    </Stack>
  );
};
