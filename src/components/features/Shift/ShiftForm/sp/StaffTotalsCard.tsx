import { Box, chakra, Flex, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { formatStaffWorkTotal } from "@/src/domains/shift/workTotals";
import { StaffMeta } from "../detailParts";
import { detailModeAtom, shiftConfigAtom, staffWorkTotalsAtom } from "../stores";

/**
 * 人ごとの合計（募集期間の全日）。くわしく表示の一覧の先頭に置く。
 * 一覧は日ごとにスタッフを並べるため、合計を各行に繰り返さず、ここへまとめる。
 */
export const StaffTotalsCard = () => {
  const detailMode = useAtomValue(detailModeAtom);
  const { staffs, displayMode } = useAtomValue(shiftConfigAtom);
  const totals = useAtomValue(staffWorkTotalsAtom);
  const [isOpen, setOpen] = useState(false);
  // スタッフ向けの確定シフト表示には出さない（人数と過不足と同じ扱い）。
  if (!detailMode || displayMode === "confirmed" || staffs.length === 0) return null;

  return (
    <Box
      as="section"
      aria-label="人ごとの合計"
      bg="white"
      borderRadius="lg"
      borderWidth="1px"
      borderColor="gray.200"
      overflow="hidden"
    >
      <chakra.button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpen((current) => !current)}
        display="flex"
        alignItems="center"
        gap={2}
        w="100%"
        minH="44px"
        px={3}
        textAlign="left"
        cursor="pointer"
        bg="transparent"
        transitionProperty="colors"
        transitionDuration="faster"
        _active={{ bg: "gray.100", transitionDuration: "0ms" }}
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
      >
        <Flex w="24px" h="24px" borderRadius="md" bg="gray.100" color="gray.600" align="center" justify="center">
          {isOpen ? <LuChevronDown size={14} aria-hidden /> : <LuChevronRight size={14} aria-hidden />}
        </Flex>
        <Text textStyle="sm" fontWeight={700} color="gray.800">
          人ごとの合計
        </Text>
      </chakra.button>
      {isOpen && (
        <Box px={3} pb={2}>
          {staffs.map((staff) => (
            <Flex
              key={staff.id}
              align="center"
              gap={2}
              py="6px"
              borderTopWidth="1px"
              borderColor="gray.100"
              textStyle="tableDense"
            >
              <Flex flex={1} minW={0} align="center" gap="6px">
                <Box color="gray.800" fontWeight={600} truncate>
                  {staff.name}
                </Box>
                <StaffMeta staff={staff} showTotal={false} />
              </Flex>
              <Box color="gray.800" fontWeight={600} fontVariantNumeric="tabular-nums" flexShrink={0}>
                {formatStaffWorkTotal(totals.get(staff.id))}
              </Box>
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
};
