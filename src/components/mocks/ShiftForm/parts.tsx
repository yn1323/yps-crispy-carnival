import { Box, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuBell, LuChevronDown, LuDownload, LuFilter, LuSave } from "react-icons/lu";

export const Avatar = ({ name, size = 28 }: { name: string; size?: number }) => {
  const hue = Math.abs(name.charCodeAt(0) * 13 + name.charCodeAt(1 % name.length) * 7) % 360;
  const bg = `oklch(0.94 0.04 ${hue})`;
  const fg = `oklch(0.42 0.12 ${hue})`;
  return (
    <Box
      w={`${size}px`}
      h={`${size}px`}
      borderRadius="50%"
      bg={bg}
      color={fg}
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize={`${Math.round(size * 0.42)}px`}
      fontWeight={700}
      flexShrink={0}
      letterSpacing="0"
    >
      {name.slice(0, 1)}
    </Box>
  );
};

export const AppHeader = ({ shopName = "カフェ モカ 渋谷店" }: { shopName?: string }) => (
  <Flex h="44px" bg="teal.600" align="center" px={5} gap={3} color="white" flexShrink={0}>
    <Box fontSize="13px" fontWeight={700} letterSpacing="0.5px">
      シフトリ
    </Box>
    <Box w="1px" h="18px" bg="whiteAlpha.400" />
    <Box fontSize="12px" opacity={0.95}>
      {shopName}
    </Box>
    <Flex ml="auto" align="center" gap={3} fontSize="12px">
      <Box opacity={0.9}>
        <LuBell size={14} />
      </Box>
      <Flex
        w="26px"
        h="26px"
        borderRadius="50%"
        bg="whiteAlpha.300"
        align="center"
        justify="center"
        fontSize="11px"
        fontWeight={700}
      >
        店
      </Flex>
    </Flex>
  </Flex>
);

export const AppHeaderSP = ({ shopName = "カフェ モカ" }: { shopName?: string }) => (
  <Flex h="44px" bg="teal.600" align="center" px={4} color="white" flexShrink={0}>
    <Box fontSize="13px" fontWeight={700}>
      シフトリ
    </Box>
    <Box ml="auto" fontSize="11px" opacity={0.9}>
      {shopName}
    </Box>
  </Flex>
);

export type TabKey = "daily" | "list";

export const PageTabs = ({
  active,
  onChange,
  compact = false,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  compact?: boolean;
}) => {
  const tabs: { k: TabKey; label: string }[] = [
    { k: "daily", label: "割当" },
    { k: "list", label: "一覧" },
  ];
  return (
    <Flex bg="white" borderBottomWidth="1px" borderColor="gray.200" flexShrink={0}>
      {tabs.map((t) => {
        const is = active === t.k;
        return (
          <Box
            key={t.k}
            onClick={() => onChange(t.k)}
            cursor="pointer"
            flex={compact ? 1 : "none"}
            textAlign="center"
            px={compact ? 0 : 6}
            py={compact ? "11px" : "13px"}
            fontSize={compact ? "13px" : "13px"}
            fontWeight={is ? 700 : 500}
            color={is ? "teal.700" : "gray.500"}
            borderBottomWidth="2px"
            borderColor={is ? "teal.600" : "transparent"}
            mb="-1px"
            transition="color 120ms"
          >
            {t.label}
          </Box>
        );
      })}
    </Flex>
  );
};

type ActionsProps = {
  compact?: boolean;
  onSave?: () => void;
  onConfirm?: () => void;
  onExport?: () => void;
};

export const HeaderActions = ({
  compact = false,
  onSave = () => {},
  onConfirm = () => {},
  onExport = () => {},
}: ActionsProps) => (
  <Flex gap={2} align="center">
    <button
      type="button"
      onClick={onSave}
      style={{
        height: compact ? 28 : 32,
        padding: compact ? "0 10px" : "0 14px",
        background: "white",
        color: "#3f3f46",
        border: "1px solid #d4d4d8",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: compact ? 12 : 13,
        fontWeight: 500,
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {compact ? <LuSave size={13} /> : "一時保存"}
    </button>
    <button
      type="button"
      onClick={onConfirm}
      style={{
        height: compact ? 28 : 32,
        padding: compact ? "0 12px" : "0 16px",
        background: "#0d9488",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: compact ? 12 : 13,
        fontWeight: 600,
        fontFamily: "inherit",
        boxShadow: "0 1px 2px rgba(13,148,136,0.25)",
      }}
    >
      {compact ? "確定" : "確定して通知する"}
    </button>
    <button
      type="button"
      onClick={onExport}
      style={{
        height: compact ? 28 : 32,
        padding: compact ? "0 10px" : "0 12px 0 14px",
        background: "white",
        color: "#0f766e",
        border: "1px solid #5eead4",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: compact ? 12 : 13,
        fontWeight: 600,
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <LuDownload size={compact ? 12 : 14} />
      {!compact && <span>エクスポート</span>}
      <LuChevronDown size={compact ? 10 : 12} style={{ opacity: 0.8 }} />
    </button>
  </Flex>
);

export const FilterButton = ({ compact = false }: { compact?: boolean }) => (
  <button
    type="button"
    style={{
      height: compact ? 28 : 32,
      padding: compact ? "0 10px" : "0 12px",
      background: "white",
      color: "#3f3f46",
      border: "1px solid #d4d4d8",
      borderRadius: 6,
      cursor: "pointer",
      fontSize: compact ? 12 : 12,
      fontWeight: 500,
      fontFamily: "inherit",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    }}
  >
    <LuFilter size={12} />
    {!compact && "絞り込み"}
  </button>
);

export const UnsubmittedStrip = ({ names }: { names: string[] }) => {
  if (!names.length) return null;
  return (
    <Flex
      align="center"
      gap={3}
      px={5}
      py="10px"
      bg="orange.50"
      borderTopWidth="1px"
      borderColor="orange.200"
      flexShrink={0}
    >
      <Box fontSize="12px" fontWeight={700} color="orange.700" flexShrink={0}>
        未提出 {names.length}人
      </Box>
      <Flex gap={2} overflow="auto" flex={1}>
        {names.map((n) => (
          <Box
            key={n}
            fontSize="11px"
            flexShrink={0}
            px={2}
            py="2px"
            color="orange.700"
            bg="white"
            borderWidth="1px"
            borderColor="orange.200"
            borderRadius="999px"
          >
            {n}
          </Box>
        ))}
      </Flex>
      <button
        type="button"
        style={{
          height: 26,
          padding: "0 10px",
          background: "white",
          color: "#b45309",
          border: "1px solid #fcd34d",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
          fontFamily: "inherit",
        }}
      >
        催促を送る
      </button>
    </Flex>
  );
};

export const UnsubmittedStripSP = ({ names }: { names: string[] }) => {
  if (!names.length) return null;
  return (
    <Flex
      align="center"
      gap={2}
      px={4}
      py={3}
      bg="orange.50"
      borderTopWidth="1px"
      borderColor="orange.200"
      flexShrink={0}
    >
      <Box w="6px" h="6px" borderRadius="50%" bg="orange.500" flexShrink={0} />
      <Box fontSize="13px" fontWeight={700} color="orange.700">
        未提出 {names.length}人
      </Box>
      <Box fontSize="11px" color="orange.700" opacity={0.8}>
        タップで催促
      </Box>
      <Box ml="auto" color="orange.700" fontSize="16px">
        ›
      </Box>
    </Flex>
  );
};

export const FrameBox = ({ children }: { children: ReactNode }) => (
  <Box w="100%" h="100%" bg="gray.50" display="flex" flexDirection="column" overflow="hidden">
    {children}
  </Box>
);
