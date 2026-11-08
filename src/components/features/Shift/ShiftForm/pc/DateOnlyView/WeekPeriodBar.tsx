import { Box, Flex, Text } from "@chakra-ui/react";
import { DisplaySettingsMenu } from "../../DisplaySettingsMenu";

/** 表の上に、左の週タブと同じ期間と表示設定を置く。並べ替えは日付の見出しで行う。 */
export const WeekPeriodBar = ({ periodLabel }: { periodLabel: string }) => (
  <Flex align="center" gap={3} px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200">
    <Text textStyle="md" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
      {periodLabel}
    </Text>
    <Box ml="auto" flexShrink={0}>
      <DisplaySettingsMenu />
    </Box>
  </Flex>
);
