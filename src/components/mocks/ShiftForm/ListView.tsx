import { Box, Flex } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuCalendar, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { buildMonthDates, dowColor, type MonthDate, monthShiftOf, STAFFS } from "./mockData";
import { Avatar } from "./parts";

type Period = "1w" | "2w" | "1m";
const periodWeeks: Record<Period, number> = { "1w": 1, "2w": 2, "1m": 4 };

const shiftHours = (asn: [string, string] | null) =>
  !asn ? 0 : Number(asn[1].slice(0, 2)) - Number(asn[0].slice(0, 2));

// ---- PC (L1b) -----------------------------------------------------------

export const ListPC = () => {
  const [period, setPeriod] = useState<Period>("1m");
  const dates = useMemo(() => buildMonthDates(periodWeeks[period]), [period]);
  const weekCount = Math.ceil(dates.length / 7);

  const initialOpen = () => {
    const o: Record<number, boolean> = {};
    for (let i = 0; i < weekCount; i++) o[i] = i < 2;
    return o;
  };
  const [open, setOpen] = useState<Record<number, boolean>>(initialOpen);

  const periodLabel = period === "1w" ? "1/5 – 1/11" : period === "2w" ? "1/5 – 1/18" : "2026年 1月";
  const toggleAll = (v: boolean) => {
    const o: Record<number, boolean> = {};
    for (let i = 0; i < weekCount; i++) o[i] = v;
    setOpen(o);
  };

  return (
    <Flex direction="column" flex={1} minH={0}>
      <Flex
        px={5}
        py={3}
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.200"
        align="center"
        gap={3}
        flexShrink={0}
        flexWrap="wrap"
      >
        <DateNav label={periodLabel} />
        <PeriodSwitcher period={period} setPeriod={setPeriod} />
        <Box w="1px" h="22px" bg="gray.200" mx={1} />
        <ModeTabs active="L1b" />
      </Flex>

      <Box flex={1} minH={0} overflow="auto" p={5}>
        {weekCount > 1 && (
          <Flex align="center" gap={2} mb={3} fontSize="12px">
            <Box color="gray.500">{weekCount}週間</Box>
            <button
              type="button"
              onClick={() => toggleAll(true)}
              style={{
                height: 26,
                padding: "0 10px",
                border: "1px solid #d4d4d8",
                background: "white",
                borderRadius: 6,
                cursor: "pointer",
                color: "#3f3f46",
                fontSize: 11,
                marginLeft: "auto",
                fontFamily: "inherit",
              }}
            >
              すべて展開
            </button>
            <button
              type="button"
              onClick={() => toggleAll(false)}
              style={{
                height: 26,
                padding: "0 10px",
                border: "1px solid #d4d4d8",
                background: "white",
                borderRadius: 6,
                cursor: "pointer",
                color: "#3f3f46",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              すべて畳む
            </button>
          </Flex>
        )}

        {Array.from({ length: weekCount }).map((_, wi) => {
          const wkDates = dates.filter((d) => d.weekIdx === wi);
          const isOpen = !!open[wi];
          const isCurrent = wi === 0;
          return (
            <WeekCard
              key={wi}
              wi={wi}
              wkDates={wkDates}
              isOpen={isOpen}
              isCurrent={isCurrent}
              onToggle={() => setOpen({ ...open, [wi]: !isOpen })}
            />
          );
        })}
      </Box>
    </Flex>
  );
};

const DateNav = ({ label }: { label: string }) => (
  <Flex align="center" gap={1}>
    <button
      type="button"
      style={{
        width: 30,
        height: 30,
        border: "1px solid #d4d4d8",
        background: "white",
        borderRadius: 6,
        color: "#52525b",
        cursor: "pointer",
      }}
    >
      <LuChevronLeft size={14} style={{ margin: "0 auto" }} />
    </button>
    <Flex
      h="30px"
      px={3}
      align="center"
      gap={2}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="6px"
      bg="white"
      fontSize="13px"
      fontWeight={700}
      color="gray.800"
    >
      <LuCalendar size={13} color="#71717a" />
      {label}
    </Flex>
    <button
      type="button"
      style={{
        width: 30,
        height: 30,
        border: "1px solid #d4d4d8",
        background: "white",
        borderRadius: 6,
        color: "#52525b",
        cursor: "pointer",
      }}
    >
      <LuChevronRight size={14} style={{ margin: "0 auto" }} />
    </button>
  </Flex>
);

const PeriodSwitcher = ({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) => {
  const options: { k: Period; label: string }[] = [
    { k: "1w", label: "1週" },
    { k: "2w", label: "2週" },
    { k: "1m", label: "1ヶ月" },
  ];
  return (
    <Flex borderWidth="1px" borderColor="gray.300" borderRadius="6px" overflow="hidden">
      {options.map((o, i) => {
        const active = period === o.k;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => setPeriod(o.k)}
            style={{
              height: 30,
              padding: "0 12px",
              background: active ? "#27272a" : "white",
              color: active ? "white" : "#3f3f46",
              border: "none",
              borderLeft: i > 0 ? "1px solid #d4d4d8" : "none",
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </Flex>
  );
};

const ModeTabs = ({ active }: { active: "L1a" | "L1b" | "L1c" }) => {
  const modes = [
    { k: "L1a", l: "週表" },
    { k: "L1b", l: "週折" },
    { k: "L1c", l: "密度" },
  ] as const;
  return (
    <Flex p="2px" bg="gray.100" borderRadius="7px" gap="2px">
      {modes.map((m) => {
        const a = active === m.k;
        return (
          <Box
            key={m.k}
            px="12px"
            py="4px"
            bg={a ? "white" : "transparent"}
            color={a ? "gray.800" : "gray.500"}
            borderRadius="5px"
            fontSize="11px"
            fontWeight={a ? 700 : 500}
            cursor="pointer"
            boxShadow={a ? "0 1px 2px rgba(0,0,0,0.06)" : "none"}
          >
            {m.l}
          </Box>
        );
      })}
    </Flex>
  );
};

const WeekCard = ({
  wi,
  wkDates,
  isOpen,
  isCurrent,
  onToggle,
}: {
  wi: number;
  wkDates: MonthDate[];
  isOpen: boolean;
  isCurrent: boolean;
  onToggle: () => void;
}) => {
  let weekHours = 0;
  let weekSlots = 0;
  const dayCounts = wkDates.map((_, i) => STAFFS.filter((s) => monthShiftOf(s.id, wi * 7 + i)).length);
  STAFFS.forEach((s) => {
    wkDates.forEach((_, i) => {
      const asn = monthShiftOf(s.id, wi * 7 + i);
      if (asn) {
        weekHours += shiftHours(asn);
        weekSlots += 1;
      }
    });
  });
  const activeStaff = STAFFS.filter((s) => wkDates.some((_, i) => monthShiftOf(s.id, wi * 7 + i))).length;

  return (
    <Box
      bg="white"
      borderRadius="10px"
      borderWidth="1px"
      borderColor={isOpen ? "teal.200" : "gray.200"}
      boxShadow="0 1px 2px rgba(0,0,0,0.03)"
      mb={3}
      overflow="hidden"
    >
      <Flex
        align="center"
        gap={4}
        px={4}
        py={3}
        bg={isOpen ? "teal.50" : "white"}
        cursor="pointer"
        borderBottomWidth={isOpen ? "1px" : "0"}
        borderColor="teal.200"
        onClick={onToggle}
      >
        <Flex
          w="28px"
          h="28px"
          borderRadius="8px"
          bg={isOpen ? "teal.600" : "gray.100"}
          color={isOpen ? "white" : "gray.500"}
          align="center"
          justify="center"
          fontSize="13px"
          fontWeight={700}
        >
          {isOpen ? "▾" : "▸"}
        </Flex>
        <Box>
          <Flex align="baseline" gap={2}>
            <Box fontSize="15px" fontWeight={700} color="gray.800">
              Week {wi + 1}
            </Box>
            {isCurrent && (
              <Box
                fontSize="10px"
                px="8px"
                py="2px"
                bg="teal.600"
                color="white"
                borderRadius="999px"
                fontWeight={700}
                letterSpacing="0.3px"
              >
                今週
              </Box>
            )}
          </Flex>
          <Box fontSize="12px" color="gray.500" mt="2px">
            {wkDates[0].d} – {wkDates[wkDates.length - 1].d}（{wkDates.length}日）
          </Box>
        </Box>

        {!isOpen && (
          <Flex align="flex-end" gap="4px" h="30px" ml={5}>
            {dayCounts.map((c, i) => {
              const max = Math.max(...dayCounts, 1);
              return (
                <Flex key={wkDates[i].iso} w="16px" direction="column" align="center" gap="2px" justify="flex-end">
                  <Box
                    w="100%"
                    h={`${Math.max(3, (c / max) * 22)}px`}
                    bg={c === 0 ? "gray.200" : "teal.400"}
                    borderRadius="2px"
                  />
                  <Box fontSize="9px" color={dowColor(wkDates[i])} fontWeight={700} lineHeight="1">
                    {wkDates[i].w}
                  </Box>
                </Flex>
              );
            })}
          </Flex>
        )}

        <Flex ml="auto" gap={6} align="center">
          <Box textAlign="right">
            <Box fontSize="10px" color="gray.500" fontWeight={600} letterSpacing="0.5px">
              合計時間
            </Box>
            <Box fontSize="18px" fontWeight={700} color="teal.700" fontVariantNumeric="tabular-nums" lineHeight="1.1">
              {weekHours}
              <Box as="span" fontSize="12px" ml="1px">
                h
              </Box>
            </Box>
          </Box>
          <Box textAlign="right">
            <Box fontSize="10px" color="gray.500" fontWeight={600} letterSpacing="0.5px">
              出勤
            </Box>
            <Box fontSize="18px" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums" lineHeight="1.1">
              {weekSlots}
              <Box as="span" fontSize="11px" ml="2px" color="gray.500">
                コマ
              </Box>
            </Box>
          </Box>
          <Box textAlign="right">
            <Box fontSize="10px" color="gray.500" fontWeight={600} letterSpacing="0.5px">
              稼働スタッフ
            </Box>
            <Box fontSize="18px" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums" lineHeight="1.1">
              {activeStaff}
              <Box as="span" fontSize="11px" ml="2px" color="gray.500">
                人
              </Box>
            </Box>
          </Box>
        </Flex>
      </Flex>

      {isOpen && <WeekTable wi={wi} wkDates={wkDates} weekHours={weekHours} />}
    </Box>
  );
};

const WeekTable = ({ wi, wkDates, weekHours }: { wi: number; wkDates: MonthDate[]; weekHours: number }) => {
  return (
    <Box overflow="auto">
      <Box as="table" w="100%" style={{ borderCollapse: "collapse" }} fontSize="12px">
        <Box as="thead">
          <Box as="tr" bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
            <Box as="th" w="200px" px={4} py="10px" textAlign="left" fontSize="11px" fontWeight={600} color="gray.600">
              スタッフ
            </Box>
            {wkDates.map((d) => (
              <Box as="th" key={d.iso} px="4px" py="10px">
                <Box fontSize="10px" color={dowColor(d)} fontWeight={700}>
                  {d.w}
                </Box>
                <Box fontSize="12px" color="gray.700" mt="2px" fontWeight={600}>
                  {d.d}
                </Box>
              </Box>
            ))}
            <Box as="th" w="72px" px={4} py="10px" textAlign="right" fontSize="11px" fontWeight={600} color="gray.600">
              計
            </Box>
          </Box>
        </Box>
        <Box as="tbody">
          {STAFFS.map((s) => {
            let total = 0;
            const isUnsub = s.status === "not_submitted";
            return (
              <Box as="tr" key={s.id} borderBottomWidth="1px" borderColor="gray.100">
                <Box as="td" px={4} py="10px">
                  <Flex align="center" gap={2}>
                    <Avatar name={s.name} size={28} />
                    <Box minW={0}>
                      <Box fontSize="13px" fontWeight={600} color={isUnsub ? "gray.400" : "gray.800"}>
                        {s.name}
                      </Box>
                      {isUnsub && (
                        <Box fontSize="10px" color="orange.600" fontWeight={700}>
                          未提出
                        </Box>
                      )}
                    </Box>
                  </Flex>
                </Box>
                {wkDates.map((d, i) => {
                  const asn = monthShiftOf(s.id, wi * 7 + i);
                  if (asn) total += shiftHours(asn);
                  return (
                    <Box as="td" key={d.iso} px="4px" py="8px" textAlign="center" verticalAlign="middle">
                      {asn ? (
                        <Box
                          display="inline-block"
                          px="8px"
                          py="4px"
                          bg="teal.50"
                          color="teal.700"
                          fontSize="11px"
                          fontWeight={600}
                          borderRadius="5px"
                          borderWidth="1px"
                          borderColor="teal.200"
                          fontVariantNumeric="tabular-nums"
                          cursor="pointer"
                          _hover={{ bg: "teal.100" }}
                        >
                          {asn[0]}–{asn[1]}
                        </Box>
                      ) : (
                        <Box color="gray.300" fontSize="12px">
                          —
                        </Box>
                      )}
                    </Box>
                  );
                })}
                <Box
                  as="td"
                  px={4}
                  py="10px"
                  textAlign="right"
                  fontWeight={700}
                  color={total ? "gray.800" : "gray.300"}
                  fontVariantNumeric="tabular-nums"
                  fontSize="13px"
                >
                  {total ? `${total}h` : "—"}
                </Box>
              </Box>
            );
          })}
        </Box>
        <Box as="tfoot">
          <Box as="tr" bg="teal.50" borderTopWidth="2px" borderColor="teal.200">
            <Box as="td" px={4} py="10px" fontSize="11px" fontWeight={700} color="teal.700">
              出勤人数
            </Box>
            {wkDates.map((d, i) => {
              const n = STAFFS.filter((s) => monthShiftOf(s.id, wi * 7 + i)).length;
              return (
                <Box
                  as="td"
                  key={d.iso}
                  px="4px"
                  py="8px"
                  textAlign="center"
                  fontSize="12px"
                  fontWeight={700}
                  color="teal.700"
                  fontVariantNumeric="tabular-nums"
                >
                  {n}人
                </Box>
              );
            })}
            <Box
              as="td"
              px={4}
              py="10px"
              textAlign="right"
              fontSize="12px"
              fontWeight={700}
              color="teal.700"
              fontVariantNumeric="tabular-nums"
            >
              {weekHours}h
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// ---- SP (L1b) -----------------------------------------------------------

export const ListSP = () => {
  const [period, setPeriod] = useState<Period>("1m");
  const dates = useMemo(() => buildMonthDates(periodWeeks[period]), [period]);
  const weekCount = Math.ceil(dates.length / 7);
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });

  const periodLabel = period === "1w" ? "1/5 – 1/11" : period === "2w" ? "1/5 – 1/18" : "2026年 1月";

  return (
    <Flex direction="column" flex={1} minH={0}>
      <Flex
        px={3}
        py={3}
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.100"
        align="center"
        gap={2}
        flexShrink={0}
      >
        <button
          type="button"
          style={{
            width: 30,
            height: 30,
            border: "1px solid #d4d4d8",
            background: "white",
            borderRadius: 6,
            color: "#52525b",
            cursor: "pointer",
          }}
        >
          <LuChevronLeft size={13} style={{ margin: "0 auto" }} />
        </button>
        <Flex
          flex={1}
          h="30px"
          align="center"
          justify="center"
          gap="6px"
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="6px"
          bg="white"
          fontSize="13px"
          fontWeight={700}
          color="gray.800"
        >
          <LuCalendar size={13} color="#71717a" />
          {periodLabel}
        </Flex>
        <button
          type="button"
          style={{
            width: 30,
            height: 30,
            border: "1px solid #d4d4d8",
            background: "white",
            borderRadius: 6,
            color: "#52525b",
            cursor: "pointer",
          }}
        >
          <LuChevronRight size={13} style={{ margin: "0 auto" }} />
        </button>
      </Flex>

      <Flex
        px={3}
        py={2}
        bg="white"
        borderBottomWidth="1px"
        borderColor="gray.200"
        gap={2}
        align="center"
        flexShrink={0}
        overflowX="auto"
      >
        <PeriodSwitcher period={period} setPeriod={setPeriod} />
        <ModeTabs active="L1b" />
      </Flex>

      <Box flex={1} minH={0} overflow="auto" p={3}>
        {Array.from({ length: weekCount }).map((_, wi) => {
          const wkDates = dates.filter((d) => d.weekIdx === wi);
          const isOpen = !!open[wi];
          const isCurrent = wi === 0;
          return (
            <WeekCardSP
              key={wi}
              wi={wi}
              wkDates={wkDates}
              isOpen={isOpen}
              isCurrent={isCurrent}
              onToggle={() => setOpen({ ...open, [wi]: !isOpen })}
            />
          );
        })}
      </Box>
    </Flex>
  );
};

const WeekCardSP = ({
  wi,
  wkDates,
  isOpen,
  isCurrent,
  onToggle,
}: {
  wi: number;
  wkDates: MonthDate[];
  isOpen: boolean;
  isCurrent: boolean;
  onToggle: () => void;
}) => {
  let weekHours = 0;
  let weekSlots = 0;
  STAFFS.forEach((s) => {
    wkDates.forEach((_, i) => {
      const asn = monthShiftOf(s.id, wi * 7 + i);
      if (asn) {
        weekHours += shiftHours(asn);
        weekSlots += 1;
      }
    });
  });

  return (
    <Box
      bg="white"
      borderRadius="10px"
      borderWidth="1px"
      borderColor={isOpen ? "teal.300" : "gray.200"}
      boxShadow={isOpen ? "0 1px 3px rgba(0,0,0,0.04)" : "none"}
      mb={2}
      overflow="hidden"
    >
      <Flex
        align="center"
        gap={2}
        p="12px 14px"
        bg={isOpen ? "teal.50" : "white"}
        borderBottomWidth={isOpen ? "1px" : "0"}
        borderColor="teal.200"
        cursor="pointer"
        onClick={onToggle}
      >
        <Flex
          w="22px"
          h="22px"
          borderRadius="6px"
          bg={isOpen ? "teal.500" : "gray.100"}
          color={isOpen ? "white" : "gray.500"}
          align="center"
          justify="center"
          fontSize="12px"
          fontWeight={700}
        >
          {isOpen ? "▾" : "▸"}
        </Flex>
        <Box flex={1}>
          <Flex align="baseline" gap={2}>
            <Box fontSize="13px" fontWeight={700} color="gray.800">
              Week {wi + 1}
            </Box>
            {isCurrent && (
              <Box fontSize="9px" px="6px" py="1px" bg="teal.600" color="white" borderRadius="999px" fontWeight={700}>
                今週
              </Box>
            )}
          </Flex>
          <Box fontSize="11px" color="gray.500" mt="1px">
            {wkDates[0].d} – {wkDates[wkDates.length - 1].d}
          </Box>
        </Box>
        <Box textAlign="right">
          <Box fontSize="14px" fontWeight={700} color="teal.700" fontVariantNumeric="tabular-nums" lineHeight="1">
            {weekHours}h
          </Box>
          <Box fontSize="10px" color="gray.500" mt="2px">
            {weekSlots}コマ
          </Box>
        </Box>
      </Flex>

      {isOpen && (
        <Box>
          {wkDates.map((d, i) => {
            const working = STAFFS.filter((s) => monthShiftOf(s.id, wi * 7 + i));
            return (
              <Flex
                key={d.iso}
                gap={3}
                p="10px 14px"
                borderTopWidth={i > 0 ? "1px" : "0"}
                borderColor="gray.100"
                align="flex-start"
              >
                <Box w="44px" flexShrink={0}>
                  <Box fontSize="10px" color={dowColor(d)} fontWeight={700}>
                    {d.w}
                  </Box>
                  <Box fontSize="14px" fontWeight={700} color="gray.800" lineHeight="1.1">
                    {d.d}
                  </Box>
                </Box>
                <Box flex={1} minW={0}>
                  {working.length > 0 ? (
                    <Flex direction="column" gap="5px">
                      {working.map((s) => {
                        const asn = monthShiftOf(s.id, wi * 7 + i);
                        return (
                          <Flex key={s.id} align="center" gap={2} fontSize="11px">
                            <Avatar name={s.name} size={22} />
                            <Box color="gray.800" fontWeight={600} minW="70px">
                              {s.name}
                            </Box>
                            <Box color="teal.700" fontWeight={700} fontVariantNumeric="tabular-nums">
                              {asn?.[0]}–{asn?.[1]}
                            </Box>
                          </Flex>
                        );
                      })}
                    </Flex>
                  ) : (
                    <Box fontSize="11px" color="gray.400" py="4px">
                      出勤なし
                    </Box>
                  )}
                </Box>
              </Flex>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
