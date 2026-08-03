import { Button, Stack, Text } from "@chakra-ui/react";
import { PageHeading } from "@/components/PageHeading";
import { routePath, withCurrentSearch } from "@/routes/appRoute";

export function NotFoundPage() {
  return (
    <Stack align="start" gap={5}>
      <PageHeading description="URLを確認するか、サマリーへ戻ってください。" title="画面が見つかりません" />
      <Text color="gray.600" fontSize="sm">
        指定された分析画面は存在しません。
      </Text>
      <Button asChild colorPalette="blue">
        <a href={withCurrentSearch(routePath({ name: "overview" }))}>サマリーへ戻る</a>
      </Button>
    </Stack>
  );
}
