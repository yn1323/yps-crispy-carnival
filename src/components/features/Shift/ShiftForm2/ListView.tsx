import { Box, Flex, Stack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { Avatar, type Period } from "./components";
import { buildDates, type DateInfo, dayColor, getShift, STAFFS, shiftHours } from "./mockData";

type ViewProps = { period: Period };

const useWeeks = (period: Period) => {
  const dates = useMemo(() => buildDates(period), [period]);
  const weekCount = Math.ceil(dates.length / 7);
  const initialOpen = useMemo(() => {
    const o: Record<number, boolean> = {};
    for (let i = 0; i < weekCount; i++) o[i] = i < 2;
    return o;
  }, [weekCount]);
  const [open, setOpen] = useState(initialOpen);
  return { dates, weekCount, open, setOpen };
};

export const ListViewPC = ({ period }: ViewProps) => {
  const { dates, weekCount, open, setOpen } = useWeeks(period);
  const toggleAll = (v: boolean) => {
    const o: Record<number, boolean> = {};
    for (let i = 0; i < weekCount; i++) o[i] = v;
    setOpen(o);
  };

  return (
    <Box bg="gray.50" flex={1} overflow="auto" px={5} py={5}>
      {weekCount > 1 && (
        <Flex align="center" gap={2} mb={3} fontSize="12px" color="gray.500">
          <span>{weekCount}週間</span>
          <Flex ml="auto" gap={2}>
            <MiniButton onClick={() => toggleAll(true)}>すべて展開</MiniButton>
            <MiniButton onClick={() => toggleAll(false)}>すべて畳む</MiniButton>
          </Flex>
        </Flex>
      )}

      <Stack gap={3}>
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
      </Stack>
    </Box>
  );
};

const MiniButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
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
    {children}
  </button>
);

const WeekCard = ({
  wi,
  wkDates,
  isOpen,
  isCurrent,
  onToggle,
}: {
  wi: number;
  wkDates: DateInfo[];
  isOpen: boolean;
  isCurrent: boolean;
  onToggle: () => void;
}) => (
  <Box
    bg="white"
    borderRadius="xl"
    borderWidth="1px"
    borderColor={isOpen ? "teal.200" : "gray.200"}
    overflow="hidden"
    boxShadow="0 1px 2px rgba(0,0,0,0.03)"
    transition="all 120ms"
  >
    <Flex
      align="center"
      gap={3}
      px={5}
      py={3}
      bg={isOpen ? "teal.50" : "white"}
      cursor="pointer"
      onClick={onToggle}
      borderBottomWidth={isOpen ? "1px" : "0"}
      borderColor="teal.200"
    >
      <Flex
        w="28px"
        h="28px"
        borderRadius="md"
        bg={isOpen ? "teal.600" : "gray.100"}
        color={isOpen ? "white" : "gray.500"}
        align="center"
        justify="center"
        flexShrink={0}
      >
        {isOpen ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
      </Flex>
      <Box fontSize="15px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
        {wkDates[0].label} – {wkDates[wkDates.length - 1].label}
      </Box>
      <Box fontSize="12px" color="gray.500">
        ({wkDates.length}日)
      </Box>
      {isCurrent && (
        <Box
          fontSize="10px"
          px="8px"
          py="2px"
          bg="teal.600"
          color="white"
          borderRadius="full"
          fontWeight={700}
          letterSpacing="0.02em"
          ml={1}
        >
          今週
        </Box>
      )}
    </Flex>

    {isOpen && <WeekTable wi={wi} wkDates={wkDates} />}
  </Box>
);

const WeekTable = ({ wi, wkDates }: { wi: number; wkDates: DateInfo[] }) => (
  <Box overflowX="auto">
    <Box as="table" w="100%" style={{ borderCollapse: "collapse", fontSize: 12 }}>
      <Box as="thead">
        <Box as="tr" bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
          <Box
            as="th"
            style={{
              padding: "10px 18px",
              textAlign: "left",
              fontWeight: 600,
              color: "#52525b",
              fontSize: 11,
              width: 200,
            }}
          >
            スタッフ
          </Box>
          {wkDates.map((d) => (
            <Box as="th" key={d.iso} style={{ padding: "10px 4px", fontWeight: 600 }}>
              <Box fontSize="12px" color="gray.700" fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                {d.label}
              </Box>
              <Box fontSize="10px" fontWeight={600} mt="2px" style={{ color: dayColor(d) }}>
                {d.wk}
              </Box>
            </Box>
          ))}
          <Box
            as="th"
            style={{
              padding: "10px 18px",
              textAlign: "right",
              fontWeight: 600,
              color: "#52525b",
              fontSize: 11,
              width: 72,
            }}
          >
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
              <Box as="td" style={{ padding: "10px 18px" }}>
                <Flex align="center" gap="10px">
                  <Avatar staff={s} size={28} />
                  <Box minW={0}>
                    <Box fontSize="13px" fontWeight={600} color={isUnsub ? "gray.400" : "gray.800"}>
                      {s.name}
                    </Box>
                    {isUnsub && (
                      <Box fontSize="10px" fontWeight={600} style={{ color: "#d97706" }}>
                        未提出
                      </Box>
                    )}
                  </Box>
                </Flex>
              </Box>
              {wkDates.map((d, i) => {
                const asn = getShift(s, wi * 7 + i).asn;
                if (asn) total += shiftHours(asn);
                return (
                  <Box as="td" key={d.iso} style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "middle" }}>
                    {asn ? (
                      <Box
                        as="span"
                        fontSize="12px"
                        fontWeight={600}
                        color="teal.700"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {asn[0]}–{asn[1]}
                      </Box>
                    ) : (
                      <Box as="span" color="gray.300" fontSize="12px">
                        —
                      </Box>
                    )}
                  </Box>
                );
              })}
              <Box
                as="td"
                style={{
                  padding: "10px 18px",
                  textAlign: "right",
                  fontWeight: 700,
                  color: total ? "#27272a" : "#d4d4d8",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                }}
              >
                {total ? `${total}h` : "—"}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  </Box>
);

export const ListViewSP = ({ period }: ViewProps) => {
  const { dates, weekCount, open, setOpen } = useWeeks(period);

  return (
    <Box flex={1} overflow="auto" bg="gray.50" px={3} py={3}>
      <Stack gap={2}>
        {Array.from({ length: weekCount }).map((_, wi) => {
          const wkDates = dates.filter((d) => d.weekIdx === wi);
          const isOpen = !!open[wi];
          const isCurrent = wi === 0;
          return (
            <Box
              key={wi}
              bg="white"
              borderRadius="lg"
              borderWidth="1px"
              borderColor={isOpen ? "teal.300" : "gray.200"}
              overflow="hidden"
              boxShadow={isOpen ? "0 1px 3px rgba(0,0,0,0.04)" : "none"}
            >
              <Flex
                align="center"
                gap={2}
                px={3}
                py={3}
                bg={isOpen ? "teal.50" : "white"}
                cursor="pointer"
                onClick={() => setOpen({ ...open, [wi]: !isOpen })}
                borderBottomWidth={isOpen ? "1px" : "0"}
                borderColor="teal.200"
              >
                <Flex
                  w="24px"
                  h="24px"
                  borderRadius="md"
                  bg={isOpen ? "teal.500" : "gray.100"}
                  color={isOpen ? "white" : "gray.500"}
                  align="center"
                  justify="center"
                >
                  {isOpen ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                </Flex>
                <Box fontSize="14px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {wkDates[0].label} – {wkDates[wkDates.length - 1].label}
                </Box>
                {isCurrent && (
                  <Box
                    fontSize="9px"
                    px="6px"
                    py="1px"
                    bg="teal.600"
                    color="white"
                    borderRadius="full"
                    fontWeight={600}
                  >
                    今週
                  </Box>
                )}
              </Flex>

              {isOpen && (
                <Box>
                  {wkDates.map((d, i) => {
                    const working = STAFFS.filter((s) => getShift(s, wi * 7 + i).asn);
                    return (
                      <Flex
                        key={d.iso}
                        gap={3}
                        px={3}
                        py={3}
                        borderTopWidth={i > 0 ? "1px" : "0"}
                        borderColor="gray.100"
                      >
                        <Box w="44px" flexShrink={0}>
                          <Box
                            fontSize="14px"
                            fontWeight={700}
                            color="gray.800"
                            lineHeight="1.1"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {d.label}
                          </Box>
                          <Box fontSize="10px" fontWeight={700} mt="2px" style={{ color: dayColor(d) }}>
                            {d.wk}
                          </Box>
                        </Box>
                        <Box flex={1} minW={0}>
                          {working.length > 0 ? (
                            <Stack gap="5px">
                              {working.map((s) => {
                                const asn = getShift(s, wi * 7 + i).asn;
                                if (!asn) return null;
                                return (
                                  <Flex key={s.id} align="center" gap={2} fontSize="11px">
                                    <Avatar staff={s} size={20} />
                                    <Box color="gray.800" fontWeight={600} flex={1} minW={0}>
                                      {s.name}
                                    </Box>
                                    <Box
                                      color="teal.700"
                                      fontWeight={600}
                                      style={{ fontVariantNumeric: "tabular-nums" }}
                                    >
                                      {asn[0]}–{asn[1]}
                                    </Box>
                                  </Flex>
                                );
                              })}
                            </Stack>
                          ) : (
                            <Box fontSize="11px" color="gray.400">
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
        })}
      </Stack>
    </Box>
  );
};
