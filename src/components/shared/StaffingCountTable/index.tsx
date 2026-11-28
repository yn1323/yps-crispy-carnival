import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { Input } from "@/src/components/ui/FormControls";
import { parseStaffingCount } from "./script";

export type StaffingCountTablePosition = { id: string; name: string; color: string };
export type StaffingCountTableRow = { id: string; label: string; detail?: string };
/** 行のID → ポジションのID → 人数。0人は持たなくてよい。 */
export type StaffingCountTableCounts = Readonly<Record<string, Readonly<Record<string, number>>>>;

export type StaffingCountTableProps = {
  positions: readonly StaffingCountTablePosition[];
  rows: readonly StaffingCountTableRow[];
  counts: StaffingCountTableCounts;
  onChange: (rowId: string, positionId: string, count: number) => void;
  isReadOnly?: boolean;
  /** 1マスに入れられる最大の人数。 */
  max?: number;
};

const DEFAULT_MAX = 99;

/**
 * 時間の軸を持たない必要人数（勤務パターンごと、1日ごと）を、数字で直接入力する表。
 * 行は区切り、列はポジション。空欄は0人として扱う。
 */
export const StaffingCountTable = ({
  positions,
  rows,
  counts,
  onChange,
  isReadOnly = false,
  max = DEFAULT_MAX,
}: StaffingCountTableProps) => (
  <Flex direction="column" role="table" aria-label="必要人数">
    {rows.map((row) => (
      <Flex
        key={row.id}
        role="row"
        direction={{ base: "column", md: "row" }}
        align={{ md: "center" }}
        gap={{ base: 2, md: 4 }}
        py={3}
        borderTopWidth="1px"
        borderColor="gray.100"
      >
        <Box role="rowheader" minW={{ md: "160px" }} flexShrink={0}>
          <Text fontSize="sm" fontWeight="semibold" color="gray.900" overflowWrap="anywhere">
            {row.label}
          </Text>
          {row.detail && (
            <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
              {row.detail}
            </Text>
          )}
        </Box>
        {/* ポジション名を左、入力欄を右へ寄せ、行が変わっても入力欄の位置をそろえる。 */}
        <Grid
          templateColumns={{ base: "minmax(0, 1fr)", md: "repeat(auto-fill, 220px)" }}
          columnGap={6}
          rowGap={2}
          flex={1}
          minW={0}
        >
          {positions.map((position) => {
            const count = counts[row.id]?.[position.id] ?? 0;
            return (
              <Flex key={position.id} role="cell" align="center" justify="space-between" gap={2} minW={0}>
                <Flex align="center" gap={2} minW={0}>
                  <Box
                    boxSize="10px"
                    borderRadius="full"
                    flexShrink={0}
                    style={{ background: position.color }}
                    aria-hidden
                  />
                  <Text fontSize="sm" color="gray.800" overflowWrap="anywhere">
                    {position.name}
                  </Text>
                </Flex>
                <Flex align="center" gap={1.5} flexShrink={0}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={max}
                    step={1}
                    w="72px"
                    h={{ base: "44px", md: "36px" }}
                    px={2}
                    fontSize="md"
                    textAlign="right"
                    fontVariantNumeric="tabular-nums"
                    bg="white"
                    aria-label={`${row.label}の${position.name}の必要人数`}
                    value={count === 0 ? "" : String(count)}
                    placeholder="0"
                    disabled={isReadOnly}
                    onChange={(event) => onChange(row.id, position.id, parseStaffingCount(event.target.value, max))}
                  />
                  <Text fontSize="sm" color="fg.muted">
                    人
                  </Text>
                </Flex>
              </Flex>
            );
          })}
        </Grid>
      </Flex>
    ))}
  </Flex>
);
