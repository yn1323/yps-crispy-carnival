import { Box, Flex } from "@chakra-ui/react";
import { StaffingPositionCounts } from "../../detailParts";
import type { StaffingSlotView } from "../../staffingPresentation";
import { summarizeStaffingSlot } from "./script";

/**
 * 表の見出しに置く、区切り1つ分の人数と過不足。
 * ポジションが2つ以上ある場合は、全体の「人数 / 必要」の下にポジションごとの内訳を並べる。
 */
export const StaffingSlotCount = ({ slot }: { slot: StaffingSlotView }) => {
  const summary = summarizeStaffingSlot(slot);
  // 内訳は、必要人数のあるポジションか、誰かが入っているポジションだけが出る（StaffingPositionCounts）。
  // 出すポジションが1つもない区切りは内訳が人数だけになるため、全体の行と重ねない。
  const hasBreakdown =
    slot.positions.length > 1 && slot.positions.some((position) => position.required !== null || position.count > 0);
  return (
    <Flex direction="column" align="center" gap="2px" minW={0} color="gray.800" title={summary.title}>
      {hasBreakdown && (
        <Box as="span" textStyle="sm" fontWeight={700} fontVariantNumeric="tabular-nums">
          {summary.totalLabel}
        </Box>
      )}
      <Box
        display="inline-flex"
        maxW="100%"
        textStyle={hasBreakdown ? "2xs" : "sm"}
        fontWeight={hasBreakdown ? 600 : 700}
      >
        <StaffingPositionCounts slot={slot} showNames={false} />
      </Box>
    </Flex>
  );
};
