import { Box, Flex } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronDown, LuDownload, LuFileSpreadsheet, LuFileText, LuPrinter, LuSave } from "react-icons/lu";
import type { StaffType, ViewMode } from "./types";

export const Avatar = ({ staff, size = 28 }: { staff: StaffType; size?: number }) => (
  <Box
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: "#f4f4f5",
      color: "#52525b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: Math.round(size * 0.42),
      fontWeight: 600,
      flexShrink: 0,
    }}
  >
    {staff.name.slice(0, 1)}
  </Box>
);

export const ViewTabs = ({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) => {
  const tabs: { k: ViewMode; label: string }[] = [
    { k: "daily", label: "日別" },
    { k: "overview", label: "一覧" },
  ];
  return (
    <Flex gap={0} role="tablist" aria-label="ビュー切替" data-tour="view-tabs">
      {tabs.map((t) => {
        const active = value === t.k;
        return (
          <Box
            key={t.k}
            role="tab"
            aria-selected={active}
            data-tour={`view-tab-${t.k}`}
            onClick={() => onChange(t.k)}
            cursor="pointer"
            py="10px"
            px={{ base: "14px", lg: "18px" }}
            fontSize="13px"
            fontWeight={active ? 700 : 500}
            color={active ? "teal.700" : "gray.500"}
            borderBottomWidth="2px"
            borderColor={active ? "teal.600" : "transparent"}
            mb="-1px"
          >
            {t.label}
          </Box>
        );
      })}
    </Flex>
  );
};

export const UnsubmittedStrip = ({ names }: { names: string[] }) => (
  <>
    <Flex
      display={{ base: "none", lg: "flex" }}
      align="center"
      gap={3}
      px={5}
      py="10px"
      flexShrink={0}
      style={{ background: "#fffbeb", borderTop: "1px solid #fde68a" }}
    >
      <Box fontSize="12px" fontWeight={600} flexShrink={0} style={{ color: "#b45309" }}>
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
            style={{
              color: "#b45309",
              background: "white",
              border: "1px solid #fde68a",
              borderRadius: 999,
            }}
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
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
          fontFamily: "inherit",
        }}
      >
        催促
      </button>
    </Flex>
    <Box display={{ base: "block", lg: "none" }} flexShrink={0}>
      <button
        type="button"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          textAlign: "left",
          background: "#fffbeb",
          borderTop: "1px solid #fde68a",
          borderLeft: "none",
          borderRight: "none",
          borderBottom: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d97706", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>未提出 {names.length}人</span>
        <span style={{ fontSize: 11, color: "#b45309", opacity: 0.8 }}>タップで催促</span>
        <span style={{ marginLeft: "auto", fontSize: 16, color: "#b45309", flexShrink: 0 }}>›</span>
      </button>
    </Box>
  </>
);

type SaveButtonProps = { compact?: boolean; onClick?: () => void };

export const SaveButton = ({ compact = false, onClick }: SaveButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="一時保存"
    style={{
      height: compact ? 28 : 32,
      padding: compact ? "0 8px" : "0 14px",
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
    {compact ? <LuSave size={14} /> : "一時保存"}
  </button>
);

type ConfirmButtonProps = {
  compact?: boolean;
  isConfirmed?: boolean;
  onClick?: () => void;
};

export const ConfirmButton = ({ compact = false, isConfirmed = false, onClick }: ConfirmButtonProps) => {
  const label = compact ? (isConfirmed ? "再通知" : "確定") : isConfirmed ? "再通知する" : "確定して通知する";
  return (
    <button
      type="button"
      data-tour="confirm-button"
      onClick={onClick}
      style={{
        height: compact ? 28 : 32,
        padding: compact ? "0 12px" : "0 16px",
        background: isConfirmed ? "white" : "#0d9488",
        color: isConfirmed ? "#0f766e" : "white",
        border: isConfirmed ? "1px solid #0d9488" : "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: compact ? 12 : 13,
        fontWeight: 600,
        fontFamily: "inherit",
        boxShadow: isConfirmed ? "none" : "0 1px 2px rgba(13,148,136,0.25)",
      }}
    >
      {label}
    </button>
  );
};

export const ExportButton = ({ compact = false }: { compact?: boolean }) => {
  const [open, setOpen] = useState(false);
  const items = [
    { k: "print", label: "印刷", sub: "バックヤードに貼り出し", icon: <LuPrinter size={16} color="#0f766e" /> },
    { k: "csv", label: "CSVで書き出し", sub: "給与計算ソフト向け", icon: <LuFileText size={16} color="#0f766e" /> },
    {
      k: "excel",
      label: "Excelで書き出し",
      sub: ".xlsx ファイル",
      icon: <LuFileSpreadsheet size={16} color="#0f766e" />,
    },
  ];
  const handleSelect = () => {
    setOpen(false);
    alert("Coming Soon");
  };
  return (
    <Box position="relative" display="inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          height: compact ? 28 : 32,
          padding: compact ? "0 10px" : "0 12px 0 14px",
          background: "#0d9488",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "inherit",
          boxShadow: "0 1px 2px rgba(13,148,136,0.25)",
        }}
      >
        <LuDownload size={compact ? 12 : 14} />
        {!compact && <span>エクスポート</span>}
        <LuChevronDown size={compact ? 10 : 12} style={{ marginLeft: 2, opacity: 0.9 }} />
      </button>
      {open && (
        <>
          <Box onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
          <Box
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 11,
              background: "white",
              border: "1px solid #e4e4e7",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
              minWidth: 240,
              padding: 6,
              fontFamily: "inherit",
            }}
          >
            {items.map((it) => (
              <Box
                key={it.k}
                onClick={handleSelect}
                _hover={{ bg: "gray.50" }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                <Box
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: "#f0fdfa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {it.icon}
                </Box>
                <Box minW={0} flex={1}>
                  <Box fontSize="13px" fontWeight={600} color="gray.800">
                    {it.label}
                  </Box>
                  <Box fontSize="11px" color="gray.500" mt="1px">
                    {it.sub}
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};
