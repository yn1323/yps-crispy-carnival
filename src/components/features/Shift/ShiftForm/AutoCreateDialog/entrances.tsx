import { Flex, Icon, Text } from "@chakra-ui/react";
import { LuSparkles } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

/** PCの上の行に置く、自動作成のダイアログを開くボタン。下書き保存と同じ強さにし、確定より目立たせない。 */
export const AutoCreateButton = ({ onClick }: { onClick: () => void }) => (
  <Button size="sm" variant="outline" onClick={onClick} h="32px" px={3} gap={1.5}>
    <Icon boxSize={4} aria-hidden="true">
      <LuSparkles focusable="false" />
    </Icon>
    自動作成
  </Button>
);

/**
 * 期間に勤務が1つもない間だけ、表の上に出す自動作成の入口。
 * 「くわしく」は勤務を入れずに開くため、最初に作るときの入口にする。勤務を1つでも入れると出さない。
 */
export const AutoCreateEmptyNotice = ({ onClick, compact }: { onClick: () => void; compact: boolean }) => (
  <Flex
    align="center"
    justify="space-between"
    gap={3}
    px={compact ? 3 : 5}
    py={2}
    bg="teal.50"
    borderBottomWidth="1px"
    borderColor="gray.200"
    flexShrink={0}
  >
    <Text fontSize="sm" color="gray.800" minW={0}>
      希望と必要人数から、期間の勤務をまとめて作れます。
    </Text>
    <Button size="xs" colorPalette="teal" onClick={onClick} flexShrink={0} gap={1}>
      <Icon boxSize={3.5} aria-hidden="true">
        <LuSparkles focusable="false" />
      </Icon>
      自動作成
    </Button>
  </Flex>
);
