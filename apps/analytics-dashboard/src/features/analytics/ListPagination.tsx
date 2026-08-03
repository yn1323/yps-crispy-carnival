import { Button, Flex, Text } from "@chakra-ui/react";

export type PageInfoViewModel = {
  continueCursor: string | null;
  isDone: boolean;
  returnedCount: number;
};

export function ListPagination({
  pageInfo,
  onNext,
}: {
  pageInfo: PageInfoViewModel;
  onNext: (cursor: string) => void;
}) {
  const hasNext = !pageInfo.isDone && pageInfo.continueCursor !== null;
  const emptyWithMoreCandidates = pageInfo.returnedCount === 0 && hasNext;
  return (
    <Flex align="center" gap={4} justify="space-between">
      <Text color="gray.500" fontSize="xs">
        {emptyWithMoreCandidates
          ? "このページに該当なし。次の候補があります"
          : `このページに ${pageInfo.returnedCount.toLocaleString("ja-JP")}件`}
      </Text>
      {hasNext ? (
        <Button onClick={() => onNext(pageInfo.continueCursor as string)} size="sm" variant="outline">
          {emptyWithMoreCandidates ? "次の候補を確認" : "次の50件"}
        </Button>
      ) : null}
    </Flex>
  );
}
