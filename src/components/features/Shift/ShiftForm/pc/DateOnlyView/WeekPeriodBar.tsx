import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { LuSettings2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { FulfillmentLabel, PositionDotLegend } from "../../assignmentCellParts";
import { DisplaySettingsMenu } from "../../DisplaySettingsMenu";
import { useShiftFormDetailActions } from "../../detailParts";
import { isToolPaletteActiveAtom, shiftConfigAtom, usesPositionColorsAtom } from "../../stores";

/**
 * 表の上に置く、週の見出し。左に期間とその週の充足率、右にポジションの凡例、「必要人数設定」、表示設定を置く。
 * 並べ替えは日付の見出しで行う。
 */
export const WeekPeriodBar = ({
  periodLabel,
  fulfillment,
}: {
  periodLabel: string;
  /** その週の充足率。必要人数が1つもない週と、充足率を出さない表示では渡さない。 */
  fulfillment: { percent: number; isFulfilled: boolean } | null;
}) => {
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  // 閲覧専用の表示では、表の上の凡例（PositionLegend）が出るため、見出しには重ねて出さない。
  const isEditable = useAtomValue(isToolPaletteActiveAtom);
  const { positions } = useAtomValue(shiftConfigAtom);
  const { onOpenSetup } = useShiftFormDetailActions();
  return (
    <Flex
      align="center"
      gap={4}
      px={4}
      py={3}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
      flexShrink={0}
      minW={0}
    >
      <Text textStyle="md" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums" flexShrink={0}>
        {periodLabel}
      </Text>
      {fulfillment && <FulfillmentLabel percent={fulfillment.percent} isFulfilled={fulfillment.isFulfilled} />}
      <Flex ml="auto" align="center" gap={3} minW={0}>
        {usesPositionColors && isEditable && <PositionDotLegend positions={positions} />}
        {isEditable && onOpenSetup && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            h="32px"
            px={2}
            gap={1}
            flexShrink={0}
            color="gray.700"
            onClick={onOpenSetup}
          >
            <Icon boxSize={4} aria-hidden>
              <LuSettings2 />
            </Icon>
            必要人数設定
          </Button>
        )}
        <Box flexShrink={0}>
          <DisplaySettingsMenu />
        </Box>
      </Flex>
    </Flex>
  );
};
