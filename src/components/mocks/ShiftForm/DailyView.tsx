import { Box, Flex, Grid } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuCheck, LuChevronLeft, LuChevronRight, LuInfo, LuPencil, LuTriangleAlert } from "react-icons/lu";
import {
  countWorkingAt,
  DATES,
  dayIsSatisfied,
  dowColor,
  PEAK_BANDS,
  positionById,
  requiredAt,
  STAFFS,
  shiftOf,
  TIME_RANGE,
  timeToPct,
  unsubmittedStaff,
} from "./mockData";
import { Avatar } from "./parts";

const HOURS = Array.from({ length: TIME_RANGE.end - TIME_RANGE.start + 1 }, (_, i) => i + TIME_RANGE.start);

const formatJp = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日`;
};

const weekdayLong: Record<string, string> = {
  月: "月曜",
  火: "火曜",
  水: "水曜",
  木: "木曜",
  金: "金曜",
  土: "土曜",
  日: "日曜",
};

// ---- PC (Pattern A, polished) --------------------------------------------

export const DailyPC = () => {
  const [selected, setSelected] = useState("2026-01-21");
  const selectedDate = DATES.find((d) => d.iso === selected) ?? DATES[0];

  const rows = useMemo(
    () =>
      STAFFS.filter((s) => s.status !== "not_submitted").map((s) => ({
        staff: s,
        shift: shiftOf(s.id, selected),
      })),
    [selected],
  );
  const working = rows.filter((r) => r.shift?.asn);
  const requesting = rows.filter((r) => r.shift?.req);
  const unassigned = rows.filter((r) => r.shift?.req && !r.shift?.asn);

  return (
    <Flex h="100%" minH={0}>
      {/* Left: day rail */}
      <Flex
        direction="column"
        w="80px"
        borderRightWidth="1px"
        borderColor="gray.200"
        bg="white"
        py={2}
        gap={1}
        flexShrink={0}
        overflow="auto"
      >
        {DATES.map((d) => {
          const active = d.iso === selected;
          const satisfied = dayIsSatisfied(d.iso);
          return (
            <Box
              key={d.iso}
              onClick={() => setSelected(d.iso)}
              mx={2}
              py="8px"
              textAlign="center"
              borderRadius="8px"
              cursor="pointer"
              bg={active ? "teal.50" : "transparent"}
              borderWidth="1px"
              borderColor={active ? "teal.300" : "transparent"}
              transition="all 120ms"
              _hover={{ bg: active ? "teal.50" : "gray.50" }}
            >
              <Box fontSize="11px" color={dowColor(d)} fontWeight={active ? 700 : 600}>
                {d.w}
              </Box>
              <Box fontSize="16px" fontWeight={700} color="gray.800" mt="1px" lineHeight="1.1">
                {d.dd ?? d.d.split("/")[1]}
              </Box>
              <Flex mt="4px" justify="center">
                <Box w="6px" h="6px" borderRadius="999px" bg={satisfied ? "green.500" : "orange.400"} />
              </Flex>
            </Box>
          );
        })}
      </Flex>

      {/* Center: timeline */}
      <Flex direction="column" flex={1} minW={0}>
        <Flex px={6} py={4} bg="white" borderBottomWidth="1px" borderColor="gray.200" align="center" gap={4}>
          <Flex gap={1}>
            <button
              type="button"
              style={{
                width: 28,
                height: 28,
                border: "1px solid #e4e4e7",
                background: "white",
                borderRadius: 6,
                color: "#71717a",
                cursor: "pointer",
              }}
            >
              <LuChevronLeft size={14} style={{ margin: "0 auto" }} />
            </button>
            <button
              type="button"
              style={{
                width: 28,
                height: 28,
                border: "1px solid #e4e4e7",
                background: "white",
                borderRadius: 6,
                color: "#71717a",
                cursor: "pointer",
              }}
            >
              <LuChevronRight size={14} style={{ margin: "0 auto" }} />
            </button>
          </Flex>
          <Box>
            <Box fontSize="12px" color="gray.500">
              {weekdayLong[selectedDate.w]}
            </Box>
            <Box fontSize="22px" fontWeight={700} color="gray.800" lineHeight="1.15">
              {formatJp(selectedDate.iso)}
            </Box>
          </Box>
          <Flex ml={4} gap={5} color="gray.600" fontSize="12px">
            <Box>
              <Box fontSize="10px" color="gray.500" fontWeight={600} letterSpacing="0.5px">
                出勤
              </Box>
              <Box fontSize="15px" fontWeight={700} color="gray.800">
                {working.length}
                <Box as="span" fontSize="11px" ml="2px" color="gray.500">
                  人
                </Box>
              </Box>
            </Box>
            <Box>
              <Box fontSize="10px" color="gray.500" fontWeight={600} letterSpacing="0.5px">
                希望
              </Box>
              <Box fontSize="15px" fontWeight={700} color="gray.800">
                {requesting.length}
                <Box as="span" fontSize="11px" ml="2px" color="gray.500">
                  人
                </Box>
              </Box>
            </Box>
            <Box>
              <Box fontSize="10px" color="gray.500" fontWeight={600} letterSpacing="0.5px">
                未割当
              </Box>
              <Box fontSize="15px" fontWeight={700} color={unassigned.length ? "orange.600" : "gray.800"}>
                {unassigned.length}
                <Box as="span" fontSize="11px" ml="2px" color="gray.500">
                  人
                </Box>
              </Box>
            </Box>
          </Flex>
          <Flex ml="auto" gap={3} align="center" fontSize="11px" color="gray.600">
            <Flex align="center" gap="6px">
              <Box
                w="16px"
                h="10px"
                borderRadius="2px"
                borderWidth="1.5px"
                borderStyle="dashed"
                borderColor="gray.400"
              />
              希望
            </Flex>
            <Flex align="center" gap="6px">
              <Box w="16px" h="10px" borderRadius="2px" bg="teal.500" />
              割当
            </Flex>
          </Flex>
        </Flex>

        <Box flex={1} minH={0} overflow="auto" px={6} py={4}>
          <TimelineTable rows={rows} hours={HOURS} />
        </Box>
      </Flex>

      {/* Right: staffing meter */}
      <StaffingMeter iso={selected} />
    </Flex>
  );
};

type TimelineRow = {
  staff: (typeof STAFFS)[number];
  shift: ReturnType<typeof shiftOf>;
};

const TimelineTable = ({ rows, hours }: { rows: TimelineRow[]; hours: number[] }) => {
  const NAME_W = 140;

  return (
    <Box
      bg="white"
      borderRadius="10px"
      borderWidth="1px"
      borderColor="gray.200"
      overflow="hidden"
      boxShadow="0 1px 2px rgba(0,0,0,0.03)"
    >
      {/* Sticky hour header */}
      <Flex bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
        <Box w={`${NAME_W}px`} flexShrink={0} px={4} py="8px" fontSize="11px" color="gray.500" fontWeight={600}>
          スタッフ
        </Box>
        <Flex flex={1} position="relative">
          {hours.slice(0, -1).map((h, i) => {
            const peak = PEAK_BANDS.some((b) => h >= b.startHour && h < b.endHour);
            return (
              <Flex
                key={h}
                flex={1}
                py="8px"
                pl="6px"
                fontSize="10px"
                color={peak ? "teal.700" : "gray.500"}
                fontWeight={peak ? 700 : 500}
                borderLeftWidth={i === 0 ? "0" : "1px"}
                borderColor="gray.100"
              >
                {h}時
              </Flex>
            );
          })}
        </Flex>
        <Box
          w="60px"
          flexShrink={0}
          py="8px"
          pr={3}
          fontSize="11px"
          color="gray.500"
          fontWeight={600}
          textAlign="right"
        >
          時間
        </Box>
      </Flex>
      {rows.map((r, idx) => (
        <StaffRow key={r.staff.id} staff={r.staff} shift={r.shift} nameWidth={NAME_W} last={idx === rows.length - 1} />
      ))}
    </Box>
  );
};

const StaffRow = ({
  staff,
  shift,
  nameWidth,
  last,
}: {
  staff: (typeof STAFFS)[number];
  shift: ReturnType<typeof shiftOf>;
  nameWidth: number;
  last: boolean;
}) => {
  const hasReq = !!shift?.req;
  const hasAsn = !!shift?.asn;
  const mismatch = hasReq && !hasAsn;
  const totalHours = shift?.asn ? Number(shift.asn[1].slice(0, 2)) - Number(shift.asn[0].slice(0, 2)) : 0;

  const segments =
    shift?.segments ?? (shift?.asn ? [{ positionId: "hall", start: shift.asn[0], end: shift.asn[1] }] : []);

  return (
    <Flex
      align="center"
      h="46px"
      borderBottomWidth={last ? "0" : "1px"}
      borderColor="gray.100"
      _hover={{ bg: "gray.50" }}
      transition="background 100ms"
    >
      <Flex w={`${nameWidth}px`} flexShrink={0} px={4} gap={2} align="center">
        <Avatar name={staff.name} size={26} />
        <Box minW={0}>
          <Box fontSize="12px" fontWeight={600} color="gray.800" lineHeight="1.2">
            {staff.name}
          </Box>
          {!hasReq && staff.status === "submitted" && (
            <Box fontSize="10px" color="gray.400" mt="1px">
              休み希望
            </Box>
          )}
          {mismatch && (
            <Flex fontSize="10px" color="orange.600" mt="1px" align="center" gap="3px">
              <LuTriangleAlert size={10} /> 未割当
            </Flex>
          )}
        </Box>
      </Flex>
      <Box flex={1} position="relative" h="30px" mx={0} bg="gray.50" borderRadius="4px">
        {/* Peak band shading */}
        {PEAK_BANDS.map((b) => {
          const left = ((b.startHour - TIME_RANGE.start) / (TIME_RANGE.end - TIME_RANGE.start)) * 100;
          const right = ((b.endHour - TIME_RANGE.start) / (TIME_RANGE.end - TIME_RANGE.start)) * 100;
          return (
            <Box
              key={b.label}
              position="absolute"
              top={0}
              bottom={0}
              left={`${left}%`}
              width={`${right - left}%`}
              bg="teal.50"
              opacity={0.55}
              pointerEvents="none"
            />
          );
        })}
        {/* Request (dashed) */}
        {hasReq && shift?.req && (
          <Box
            position="absolute"
            top={0}
            bottom={0}
            left={`${timeToPct(shift.req[0])}%`}
            width={`${timeToPct(shift.req[1]) - timeToPct(shift.req[0])}%`}
            borderWidth="1.5px"
            borderStyle="dashed"
            borderColor="gray.400"
            borderRadius="4px"
          />
        )}
        {/* Assigned segments colored by position */}
        {hasAsn &&
          segments.map((seg, i) => {
            const pos = positionById(seg.positionId);
            const leftPct = timeToPct(seg.start);
            const widthPct = timeToPct(seg.end) - leftPct;
            return (
              <Box
                key={`${seg.positionId}-${i}`}
                position="absolute"
                top="4px"
                bottom="4px"
                left={`${leftPct}%`}
                width={`${widthPct}%`}
                bg={pos.color}
                borderRadius={i === 0 ? "4px 0 0 4px" : i === segments.length - 1 ? "0 4px 4px 0" : "0"}
                display="flex"
                alignItems="center"
                px="6px"
                color="white"
                fontSize="10px"
                fontWeight={700}
                overflow="hidden"
                whiteSpace="nowrap"
                cursor="grab"
                _hover={{ filter: "brightness(1.06)" }}
                title={`${pos.name} ${seg.start}–${seg.end}`}
              >
                {widthPct > 8 && <Box>{pos.name}</Box>}
              </Box>
            );
          })}
        {/* Assignment time label */}
        {hasAsn && shift?.asn && (
          <Box
            position="absolute"
            top="4px"
            bottom="4px"
            left={`${timeToPct(shift.asn[0])}%`}
            width={`${timeToPct(shift.asn[1]) - timeToPct(shift.asn[0])}%`}
            display="flex"
            alignItems="center"
            justifyContent="flex-end"
            pr="6px"
            pointerEvents="none"
            fontSize="10px"
            fontWeight={700}
            color="whiteAlpha.900"
          >
            {shift.asn[0]}〜{shift.asn[1]}
          </Box>
        )}
      </Box>
      <Flex w="60px" flexShrink={0} justify="flex-end" pr={3} align="center" gap={1}>
        {totalHours > 0 ? (
          <Box fontSize="12px" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
            {totalHours}h
          </Box>
        ) : (
          <Box fontSize="12px" color="gray.300">
            —
          </Box>
        )}
      </Flex>
    </Flex>
  );
};

const StaffingMeter = ({ iso }: { iso: string }) => {
  return (
    <Box w="260px" flexShrink={0} borderLeftWidth="1px" borderColor="gray.200" bg="white" p={4} overflow="auto">
      <Flex align="center" gap={2} mb={3}>
        <Box fontSize="12px" fontWeight={700} color="gray.600">
          時間帯の充足
        </Box>
        <Box color="gray.400" display="flex" alignItems="center">
          <LuInfo size={12} />
        </Box>
      </Flex>

      <Flex direction="column" gap={3} mb={5}>
        {PEAK_BANDS.map((b) => {
          const counts = [];
          for (let h = b.startHour; h < b.endHour; h++) counts.push(countWorkingAt(iso, h));
          const min = Math.min(...counts);
          const ok = min >= b.required;
          return (
            <Box
              key={b.label}
              borderWidth="1px"
              borderColor={ok ? "teal.100" : "orange.200"}
              bg={ok ? "teal.50" : "orange.50"}
              borderRadius="8px"
              p="10px 12px"
            >
              <Flex align="center" gap={2}>
                <Box fontSize="11px" fontWeight={700} color={ok ? "teal.700" : "orange.700"}>
                  {b.label}
                </Box>
                <Box fontSize="10px" color={ok ? "teal.700" : "orange.700"} opacity={0.7}>
                  {b.startHour}:00–{b.endHour}:00
                </Box>
                <Box ml="auto" color={ok ? "teal.600" : "orange.500"}>
                  {ok ? <LuCheck size={14} /> : <LuTriangleAlert size={14} />}
                </Box>
              </Flex>
              <Flex align="baseline" gap="3px" mt="4px">
                <Box fontSize="18px" fontWeight={700} color={ok ? "teal.700" : "orange.700"} lineHeight="1">
                  {min}
                </Box>
                <Box fontSize="11px" color={ok ? "teal.700" : "orange.700"}>
                  / {b.required}人
                </Box>
                <Box fontSize="10px" color="gray.500" ml={1}>
                  (最小)
                </Box>
              </Flex>
            </Box>
          );
        })}
      </Flex>

      <Box fontSize="11px" color="gray.500" fontWeight={600} mb={2} letterSpacing="0.5px">
        時刻別
      </Box>
      <Flex direction="column" gap="2px">
        {HOURS.slice(0, -1).map((h) => {
          const c = countWorkingAt(iso, h);
          const r = requiredAt(h);
          const ok = c >= r;
          const peak = PEAK_BANDS.some((b) => h >= b.startHour && h < b.endHour);
          return (
            <Grid
              key={h}
              templateColumns="32px 1fr 44px"
              alignItems="center"
              gap="8px"
              fontSize="11px"
              py="3px"
              px="4px"
              borderRadius="4px"
              bg={peak ? "teal.50" : "transparent"}
            >
              <Box color="gray.500" fontWeight={peak ? 700 : 500}>
                {h}時
              </Box>
              <Box h="6px" bg="gray.100" borderRadius="999px" overflow="hidden">
                <Box w={`${Math.min(100, (c / Math.max(r, 1)) * 100)}%`} h="100%" bg={ok ? "teal.500" : "orange.500"} />
              </Box>
              <Box
                textAlign="right"
                color={ok ? "gray.700" : "orange.600"}
                fontWeight={ok ? 500 : 700}
                fontVariantNumeric="tabular-nums"
              >
                {c}/{r}
              </Box>
            </Grid>
          );
        })}
      </Flex>
    </Box>
  );
};

// ---- SP (Pattern A, polished) --------------------------------------------

export const DailySP = () => {
  const [selected, setSelected] = useState("2026-01-21");
  const selectedDate = DATES.find((d) => d.iso === selected) ?? DATES[0];

  const rows = STAFFS.filter((s) => s.status !== "not_submitted").map((s) => ({
    staff: s,
    shift: shiftOf(s.id, selected),
  }));
  const working = rows.filter((r) => r.shift?.asn).length;
  const satisfied = dayIsSatisfied(selected);

  return (
    <Box overflow="auto">
      {/* Header summary */}
      <Box px={4} pt={3} pb={2} bg="white" borderBottomWidth="1px" borderColor="gray.100">
        <Flex align="baseline" gap={2}>
          <Box fontSize="18px" fontWeight={700} color="gray.800">
            {formatJp(selectedDate.iso)}
          </Box>
          <Box fontSize="12px" color={dowColor(selectedDate)} fontWeight={700}>
            ({selectedDate.w})
          </Box>
          <Box
            ml="auto"
            px="8px"
            py="2px"
            borderRadius="999px"
            fontSize="10px"
            fontWeight={700}
            bg={satisfied ? "teal.50" : "orange.50"}
            color={satisfied ? "teal.700" : "orange.700"}
            borderWidth="1px"
            borderColor={satisfied ? "teal.200" : "orange.200"}
          >
            {satisfied ? "充足 OK" : "要確認"}
          </Box>
        </Flex>
        <Box fontSize="11px" color="gray.500" mt="2px">
          出勤 {working}人・希望 {rows.filter((r) => r.shift?.req).length}人
        </Box>
      </Box>

      {/* Day ribbon */}
      <Box bg="white" px={4} py={3} borderBottomWidth="1px" borderColor="gray.100">
        <Flex gap={2} overflowX="auto">
          {DATES.map((d) => {
            const active = d.iso === selected;
            const ok = dayIsSatisfied(d.iso);
            return (
              <Box
                key={d.iso}
                onClick={() => setSelected(d.iso)}
                flexShrink={0}
                w="48px"
                py="8px"
                textAlign="center"
                borderRadius="10px"
                bg={active ? "teal.50" : "white"}
                borderWidth="1px"
                borderColor={active ? "teal.400" : "gray.200"}
                cursor="pointer"
              >
                <Box fontSize="10px" color={dowColor(d)} fontWeight={700}>
                  {d.w}
                </Box>
                <Box fontSize="14px" fontWeight={700} color="gray.800">
                  {d.dd ?? d.d.split("/")[1]}
                </Box>
                <Box mt="2px">
                  <Box mx="auto" w="6px" h="6px" borderRadius="999px" bg={ok ? "green.500" : "orange.400"} />
                </Box>
              </Box>
            );
          })}
        </Flex>
      </Box>

      {/* Peak band summary */}
      <Flex gap={2} px={4} py={3}>
        {PEAK_BANDS.map((b) => {
          const counts = [];
          for (let h = b.startHour; h < b.endHour; h++) counts.push(countWorkingAt(selected, h));
          const min = Math.min(...counts);
          const ok = min >= b.required;
          return (
            <Box
              key={b.label}
              flex={1}
              borderWidth="1px"
              borderColor={ok ? "teal.200" : "orange.200"}
              bg={ok ? "teal.50" : "orange.50"}
              borderRadius="10px"
              p="10px"
            >
              <Flex align="center" justify="space-between">
                <Box fontSize="11px" fontWeight={700} color={ok ? "teal.700" : "orange.700"}>
                  {b.label}
                </Box>
                <Box color={ok ? "teal.600" : "orange.500"}>
                  {ok ? <LuCheck size={12} /> : <LuTriangleAlert size={12} />}
                </Box>
              </Flex>
              <Flex align="baseline" gap="3px" mt="3px">
                <Box fontSize="16px" fontWeight={700} color={ok ? "teal.700" : "orange.700"} lineHeight="1">
                  {min}
                </Box>
                <Box fontSize="10px" color={ok ? "teal.700" : "orange.700"}>
                  /{b.required}人
                </Box>
              </Flex>
              <Box fontSize="10px" color="gray.500" mt="3px">
                {b.startHour}:00–{b.endHour}:00
              </Box>
            </Box>
          );
        })}
      </Flex>

      {/* Cards */}
      <Flex direction="column" gap={2} px={4} pb={4}>
        {rows.map(({ staff, shift }) => {
          const req = shift?.req;
          const asn = shift?.asn;
          const mismatch = req && !asn;
          const segments = shift?.segments ?? (asn ? [{ positionId: "hall", start: asn[0], end: asn[1] }] : []);
          return (
            <Box
              key={staff.id}
              bg="white"
              borderRadius="10px"
              borderWidth="1px"
              borderColor={mismatch ? "orange.200" : "gray.200"}
              p={3}
            >
              <Flex align="center" gap={2} mb={req ? "8px" : "4px"}>
                <Avatar name={staff.name} size={28} />
                <Box fontSize="14px" fontWeight={700} color="gray.800">
                  {staff.name}
                </Box>
                <Box ml="auto" fontSize="11px" color="gray.500">
                  {req ? `希望 ${req[0]}〜${req[1]}` : "休み希望"}
                </Box>
                <Box color="gray.400">
                  <LuPencil size={13} />
                </Box>
              </Flex>
              {req ? (
                <Box position="relative" h="26px" bg="gray.50" borderRadius="4px">
                  {/* peak shading */}
                  {PEAK_BANDS.map((b) => {
                    const left = ((b.startHour - TIME_RANGE.start) / (TIME_RANGE.end - TIME_RANGE.start)) * 100;
                    const right = ((b.endHour - TIME_RANGE.start) / (TIME_RANGE.end - TIME_RANGE.start)) * 100;
                    return (
                      <Box
                        key={b.label}
                        position="absolute"
                        top={0}
                        bottom={0}
                        left={`${left}%`}
                        width={`${right - left}%`}
                        bg="teal.50"
                        opacity={0.5}
                      />
                    );
                  })}
                  <Box
                    position="absolute"
                    top={0}
                    bottom={0}
                    left={`${timeToPct(req[0])}%`}
                    width={`${timeToPct(req[1]) - timeToPct(req[0])}%`}
                    borderWidth="1.5px"
                    borderStyle="dashed"
                    borderColor="gray.400"
                    borderRadius="4px"
                  />
                  {segments.map((seg, i) => {
                    const pos = positionById(seg.positionId);
                    const left = timeToPct(seg.start);
                    const width = timeToPct(seg.end) - left;
                    return (
                      <Box
                        key={`${seg.positionId}-${i}`}
                        position="absolute"
                        top="3px"
                        bottom="3px"
                        left={`${left}%`}
                        width={`${width}%`}
                        bg={pos.color}
                        borderRadius={i === 0 ? "3px 0 0 3px" : i === segments.length - 1 ? "0 3px 3px 0" : "0"}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        fontSize="9px"
                        fontWeight={700}
                        color="white"
                        overflow="hidden"
                        whiteSpace="nowrap"
                      >
                        {width > 12 ? pos.name : ""}
                      </Box>
                    );
                  })}
                  {asn && (
                    <Box
                      position="absolute"
                      top="3px"
                      bottom="3px"
                      left={`${timeToPct(asn[0])}%`}
                      width={`${timeToPct(asn[1]) - timeToPct(asn[0])}%`}
                      display="flex"
                      alignItems="center"
                      justifyContent="flex-end"
                      pr="4px"
                      fontSize="9px"
                      fontWeight={700}
                      color="whiteAlpha.900"
                      pointerEvents="none"
                    >
                      {asn[0]}〜{asn[1]}
                    </Box>
                  )}
                </Box>
              ) : (
                <Box fontSize="11px" color="gray.400" py="4px">
                  この日は休み
                </Box>
              )}
              {mismatch && (
                <Flex align="center" gap={1} fontSize="11px" color="orange.600" mt="6px" fontWeight={600}>
                  <LuTriangleAlert size={12} />
                  希望あり・未割当
                </Flex>
              )}
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
};

export const unsubmittedNames = () => unsubmittedStaff().map((s) => s.name);
