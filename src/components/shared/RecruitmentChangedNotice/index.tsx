import { Alert, Stack } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";

export function RecruitmentChangedNotice({ onReload }: { onReload: () => void }) {
  return (
    <Stack gap={4} p={{ base: 4, md: 6 }}>
      <Alert.Root status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>募集条件が変更されました。</Alert.Title>
          <Alert.Description>再読み込みして、入力を続けてください。</Alert.Description>
        </Alert.Content>
      </Alert.Root>
      <Button colorPalette="teal" alignSelf="flex-end" onClick={onReload}>
        再読み込み
      </Button>
    </Stack>
  );
}
