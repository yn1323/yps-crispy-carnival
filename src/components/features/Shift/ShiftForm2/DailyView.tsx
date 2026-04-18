import { Box, Flex, Stack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { Avatar, type Period } from "./components";
import { buildDates, type DateInfo, dayColor, getShift, STAFFS, TIME_RANGE, timeToPct } from "./mockData";

type ViewProps = { period: Period };

const hours = Array.from({ length: TIME_RANGE.end - TIME_RANGE.start + 1 }, (_, i) => i + TIME_RANGE.start);

const useDailyState = (period: Period) => {
  const dates = useMemo(() => buildDates(period), [period]);
  const [selectedOffset, setSelectedOffset] = useState(0);
  const selected = dates[Math.min(selectedOffset, dates.length - 1)];
  return { dates, selected, setSelectedOffset };
};

const rowsFor = (dayOffset: number) => STAFFS.map((s) => ({ staff: s, shift: getShift(s, dayOffset) }));

export const DailyViewPC = ({ period }: ViewProps) => {
  const { dates, selected, setSelectedOffset } = useDailyState(period);
  const rows = rowsFor(selected.dayOffset);

  return (
    <Flex flex={1} minH={0}>
      <DateRail dates={dates} selected={selected} onSelect={setSelectedOffset} />
      <Flex direction="column" flex={1} minW={0}>
        <DayTitle selected={selected} />
        <Box flex={1} overflow="auto" px={5} py={3} bg="gray.50">
          <TimelineHeader />
          <Box bg="white" borderRadius="lg" borderWidth="1px" borderColor="gray.200" mt={2} p={3}>
            {rows
              .filter((r) => r.staff.status !== "not_submitted")
              .map(({ staff, shift }) => (
                <StaffRow key={staff.id} staff={staff} shift={shift} />
              ))}
          </Box>
        </Box>
      </Flex>
    </Flex>
  );
};

const DateRail = ({
  dates,
  selected,
  onSelect,
}: {
  dates: DateInfo[];
  selected: DateInfo;
  onSelect: (offset: number) => void;
}) => (
  <Box w="80px" h="100%" borderRightWidth="1px" borderColor="gray.200" bg="white" py={2} flexShrink={0} overflow="auto">
    <Stack gap={1} px={2}>
      {dates.map((d) => {
        const active = d.iso === selected.iso;
        return (
          <Box
            key={d.iso}
            onClick={() => onSelect(d.dayOffset)}
            cursor="pointer"
            py="6px"
            px="8px"
            borderRadius="md"
            borderWidth="1px"
            borderColor={active ? "teal.300" : "transparent"}
            bg={active ? "teal.50" : "transparent"}
            transition="all 120ms"
            _hover={{ bg: active ? "teal.50" : "gray.50" }}
          >
            <Flex align="baseline" justify="center" gap="3px">
              <Box fontSize="14px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
                {d.day}
              </Box>
              <Box fontSize="12px" fontWeight={600} style={{ color: dayColor(d) }}>
                ({d.wk})
              </Box>
            </Flex>
          </Box>
        );
      })}
    </Stack>
  </Box>
);

const DayTitle = ({ selected }: { selected: DateInfo }) => (
  <Box px={5} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200">
    <Flex align="baseline" gap={2}>
      <Box fontSize="22px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
        {selected.month}月{selected.day}日
      </Box>
      <Box fontSize="13px" style={{ color: dayColor(selected) }} fontWeight={600}>
        ({selected.wk})
      </Box>
    </Flex>
  </Box>
);

const TimelineHeader = () => (
  <Flex pl="140px" pr={3} fontSize="10px" color="gray.500" borderBottomWidth="1px" borderColor="gray.200" pb={1}>
    {hours.map((h) => (
      <Box key={h} flex={1} textAlign="left" style={{ fontVariantNumeric: "tabular-nums" }}>
        {h}:00
      </Box>
    ))}
  </Flex>
);

type RowProps = {
  staff: (typeof STAFFS)[number];
  shift: ReturnType<typeof getShift>;
};

const StaffRow = ({ staff, shift }: RowProps) => {
  const hasReq = !!shift.req;
  const hasAsn = !!shift.asn;
  return (
    <Flex align="center" h="40px" borderBottomWidth="1px" borderColor="gray.100" _last={{ borderBottom: "none" }}>
      <Flex align="center" gap={2} w="136px" pr={2} flexShrink={0}>
        <Avatar staff={staff} size={24} />
        <Box fontSize="13px" color="gray.800" fontWeight={500} truncate>
          {staff.name}
        </Box>
        {!hasReq && staff.status === "submitted" && (
          <Box fontSize="10px" color="gray.400">
            休み
          </Box>
        )}
      </Flex>
      <Box flex={1} position="relative" h="32px" bg={hasReq ? "gray.50" : "transparent"} borderRadius="md">
        {hasReq && shift.req && (
          <Box
            position="absolute"
            top={0}
            bottom={0}
            left={`${timeToPct(shift.req[0])}%`}
            w={`${timeToPct(shift.req[1]) - timeToPct(shift.req[0])}%`}
            border="1.5px dashed #a1a1aa"
            borderRadius="md"
            display="flex"
            alignItems="center"
            px={2}
            fontSize="10px"
            color="gray.500"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            希望 {shift.req[0]}–{shift.req[1]}
          </Box>
        )}
        {hasAsn && shift.asn && (
          <Box
            position="absolute"
            top="4px"
            bottom="4px"
            left={`${timeToPct(shift.asn[0])}%`}
            w={`${timeToPct(shift.asn[1]) - timeToPct(shift.asn[0])}%`}
            bg="teal.500"
            borderRadius="md"
            display="flex"
            alignItems="center"
            px="10px"
            color="white"
            fontSize="11px"
            fontWeight={600}
            boxShadow="0 1px 2px rgba(13,148,136,0.3)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {shift.asn[0]}–{shift.asn[1]}
          </Box>
        )}
      </Box>
    </Flex>
  );
};

export const DailyViewSP = ({ period }: ViewProps) => {
  const { dates, selected, setSelectedOffset } = useDailyState(period);
  const rows = rowsFor(selected.dayOffset);

  return (
    <Flex direction="column" flex={1} minH={0}>
      <Box px={3} pt={3} pb={2} bg="white" borderBottomWidth="1px" borderColor="gray.100" flexShrink={0}>
        <Flex gap={2} overflow="auto" pb={1}>
          {dates.map((d) => {
            const active = d.iso === selected.iso;
            return (
              <Box
                key={d.iso}
                onClick={() => setSelectedOffset(d.dayOffset)}
                flexShrink={0}
                w="52px"
                py="8px"
                textAlign="center"
                borderRadius="md"
                borderWidth="1px"
                borderColor={active ? "teal.400" : "gray.200"}
                bg={active ? "teal.50" : "white"}
                cursor="pointer"
              >
                <Box
                  fontSize="16px"
                  fontWeight={700}
                  color={active ? "teal.700" : "gray.800"}
                  lineHeight="1.1"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {d.day}
                </Box>
                <Box fontSize="10px" mt="2px" fontWeight={active ? 700 : 500} style={{ color: dayColor(d) }}>
                  {d.wk}
                </Box>
              </Box>
            );
          })}
        </Flex>
      </Box>

      <Box px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
        <Flex align="baseline" gap={2}>
          <Box fontSize="20px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
            {selected.month}月{selected.day}日
          </Box>
          <Box fontSize="13px" fontWeight={600} style={{ color: dayColor(selected) }}>
            ({selected.wk})
          </Box>
        </Flex>
      </Box>

      <Box flex={1} overflow="auto" bg="gray.50" px={3} py={3}>
        <Stack gap={2}>
          {rows
            .filter((r) => r.staff.status !== "not_submitted")
            .map(({ staff, shift }) => (
              <SPDailyCard key={staff.id} staff={staff} shift={shift} />
            ))}
        </Stack>
      </Box>
    </Flex>
  );
};

const SPDailyCard = ({ staff, shift }: RowProps) => {
  const hasReq = !!shift.req;
  const hasAsn = !!shift.asn;
  const mismatch = hasReq && !hasAsn;
  return (
    <Box
      bg="white"
      borderRadius="lg"
      borderWidth="1px"
      borderColor={mismatch ? "orange.200" : "gray.200"}
      px={3}
      py="10px"
    >
      <Flex align="center" gap={2} mb={2}>
        <Avatar staff={staff} size={28} />
        <Box fontSize="13px" fontWeight={600} color="gray.800" flex={1}>
          {staff.name}
        </Box>
        {mismatch && (
          <Box
            fontSize="10px"
            fontWeight={700}
            px={2}
            py="1px"
            style={{
              color: "#b45309",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 999,
            }}
          >
            希望あり
          </Box>
        )}
        {hasAsn && shift.asn && (
          <Box fontSize="11px" fontWeight={700} color="teal.700" style={{ fontVariantNumeric: "tabular-nums" }}>
            {shift.asn[0]}–{shift.asn[1]}
          </Box>
        )}
        {!hasReq && staff.status === "submitted" && (
          <Box fontSize="10px" color="gray.400">
            休み
          </Box>
        )}
      </Flex>
      <Box position="relative" h="22px" bg="gray.50" borderRadius="md">
        {hasReq && shift.req && (
          <Box
            position="absolute"
            top={0}
            bottom={0}
            left={`${timeToPct(shift.req[0])}%`}
            w={`${timeToPct(shift.req[1]) - timeToPct(shift.req[0])}%`}
            border="1.5px dashed #a1a1aa"
            borderRadius="md"
          />
        )}
        {hasAsn && shift.asn && (
          <Box
            position="absolute"
            top="3px"
            bottom="3px"
            left={`${timeToPct(shift.asn[0])}%`}
            w={`${timeToPct(shift.asn[1]) - timeToPct(shift.asn[0])}%`}
            bg="teal.500"
            borderRadius="md"
          />
        )}
      </Box>
    </Box>
  );
};
