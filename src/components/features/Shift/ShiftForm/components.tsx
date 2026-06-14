import { Box, Flex } from "@chakra-ui/react";
import { LuSave } from "react-icons/lu";
import type { StaffType, ViewMode } from "@/src/domains/shift/types";

// エラー（赤）と確認事項（オレンジ）で色を切り替える。色規約: red=エラー / orange=要対応・警告
export type IssueTone = "error" | "warning";
const TONE_DOT_BG: Record<IssueTone, string> = { error: "red.500", warning: "orange.400" };
const TONE_BADGE_BG: Record<IssueTone, string> = { error: "red.500", warning: "orange.400" };
const TONE_NOUN: Record<IssueTone, string> = { error: "エラー", warning: "確認事項" };

// スタッフ行・カードを強調するトーンごとの配色（bg=淡色 / border=枠 / borderBoxShadow=inset枠）。
const TONE_EMPHASIS: Record<IssueTone, { bg: string; border: string; borderColorToken: string }> = {
  error: { bg: "red.50", border: "red.300", borderColorToken: "red-300" },
  warning: { bg: "orange.50", border: "orange.300", borderColorToken: "orange-300" },
};

// エラー（赤）を優先し、なければ確認事項（オレンジ）を選ぶ。どちらもなければnull。
export const resolveIssueTone = (hasError: boolean, hasWarning: boolean): IssueTone | null =>
  hasError ? "error" : hasWarning ? "warning" : null;

// 強調トーンの配色を引く。toneがnullなら配色なし（通常表示）。
export const issueToneEmphasis = (tone: IssueTone | null) => (tone ? TONE_EMPHASIS[tone] : null);

// 日付チップ右上のバッジ。エラー件数を優先し、なければ確認事項件数を表示する。両方0ならnull。
export const DateIssueBadge = ({ issueCount, warningCount }: { issueCount: number; warningCount: number }) => {
  if (issueCount > 0) return <IssueCountBadge count={issueCount} tone="error" />;
  if (warningCount > 0) return <IssueCountBadge count={warningCount} tone="warning" />;
  return null;
};

// 日付チップの枠色。エラー（赤）優先 → 確認事項（オレンジ）。件数がなければfallback、選択中はactiveを優先。
export const dateIssueBorderColor = (args: {
  active: boolean;
  issueCount: number;
  warningCount: number;
  activeColor: string;
  fallbackColor: string;
}): string => {
  if (args.active) return args.activeColor;
  if (args.issueCount > 0) return "red.200";
  if (args.warningCount > 0) return "orange.200";
  return args.fallbackColor;
};

// 日付チップ（DateRail / SP日付ピッカー）右上に重ねる件数バッジ。
export const IssueCountBadge = ({ count, tone = "error" }: { count: number; tone?: IssueTone }) => (
  <Flex
    aria-label={`${TONE_NOUN[tone]}${count}件`}
    position="absolute"
    top="-5px"
    right="-5px"
    minW="16px"
    h="16px"
    px="4px"
    align="center"
    justify="center"
    borderRadius="full"
    bg={TONE_BADGE_BG[tone]}
    color="white"
    fontSize="10px"
    fontWeight={700}
    lineHeight={1}
  >
    {count}
  </Flex>
);

// スタッフ行・カードの印（赤＝エラー / オレンジ＝確認事項のドット）。
export const IssueDot = ({ tone = "error" }: { tone?: IssueTone }) => (
  <Box boxSize="6px" borderRadius="full" bg={TONE_DOT_BG[tone]} flexShrink={0} aria-label={`${TONE_NOUN[tone]}あり`} />
);

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
      // Avatar initials scale with the configured avatar box size.
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
    <Flex gap={0} role="tablist" aria-label="表示切替" data-tour="view-tabs">
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
            textStyle="sm"
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

type UnsubmittedStripProps = {
  names: string[];
  reminderStatus: ReminderStatus;
  onOpenDetails?: () => void;
};

export type ReminderStatus = {
  kind: "scheduled" | "sent" | "none";
  label: string;
};

export const UnsubmittedStrip = ({ names, reminderStatus, onOpenDetails }: UnsubmittedStripProps) => {
  const statusColor =
    reminderStatus.kind === "sent" ? "#047857" : reminderStatus.kind === "scheduled" ? "#92400e" : "#78716c";
  return (
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
        <Box textStyle="caption" fontWeight={600} flexShrink={0} style={{ color: "#b45309" }}>
          未提出 {names.length}人
        </Box>
        <Flex gap={2} overflow="auto" flex={1}>
          {names.map((n) => (
            <Box
              key={n}
              textStyle="caption"
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
        <Box textStyle="caption" flexShrink={0} style={{ color: statusColor }}>
          {reminderStatus.label}
        </Box>
      </Flex>
      <Box display={{ base: "block", lg: "none" }} flexShrink={0}>
        <button
          type="button"
          onClick={onOpenDetails}
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
            cursor: onOpenDetails ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d97706", flexShrink: 0 }} />
          <span style={{ fontSize: "var(--chakra-font-sizes-sm)", fontWeight: 700, color: "#b45309" }}>
            未提出 {names.length}人
          </span>
          <span style={{ fontSize: "var(--chakra-font-sizes-xs)", color: "#b45309", opacity: 0.8 }}>
            {reminderStatus.label}
          </span>
          {onOpenDetails && (
            <span
              style={{ marginLeft: "auto", fontSize: "var(--chakra-font-sizes-md)", color: "#b45309", flexShrink: 0 }}
            >
              ›
            </span>
          )}
        </button>
      </Box>
    </>
  );
};

type SaveButtonProps = { compact?: boolean; isSaving?: boolean; onClick?: () => void };

export const SaveButton = ({ compact = false, isSaving = false, onClick }: SaveButtonProps) => (
  <button
    type="button"
    onClick={isSaving ? undefined : onClick}
    disabled={isSaving}
    aria-busy={isSaving}
    aria-label="下書き保存"
    style={{
      height: compact ? 28 : 32,
      padding: compact ? "0 8px" : "0 14px",
      background: "white",
      color: "#3f3f46",
      border: "1px solid #d4d4d8",
      borderRadius: 6,
      cursor: isSaving ? "wait" : "pointer",
      fontSize: compact ? "var(--chakra-font-sizes-xs)" : "var(--chakra-font-sizes-sm)",
      fontWeight: 500,
      fontFamily: "inherit",
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
    }}
  >
    {compact ? <LuSave size={14} /> : isSaving ? "保存中" : "下書き保存"}
  </button>
);

type ConfirmButtonProps = {
  compact?: boolean;
  isConfirmed?: boolean;
  isConfirming?: boolean;
  onClick?: () => void;
};

export const ConfirmButton = ({
  compact = false,
  isConfirmed = false,
  isConfirming = false,
  onClick,
}: ConfirmButtonProps) => {
  const label = isConfirming
    ? compact
      ? "処理中"
      : "処理中"
    : compact
      ? isConfirmed
        ? "再通知"
        : "確定"
      : isConfirmed
        ? "もう一度通知"
        : "シフトを確定して通知";
  return (
    <button
      type="button"
      data-tour="confirm-button"
      onClick={isConfirming ? undefined : onClick}
      disabled={isConfirming}
      aria-busy={isConfirming}
      style={{
        height: compact ? 28 : 32,
        padding: compact ? "0 12px" : "0 16px",
        background: isConfirmed ? "white" : "#0d9488",
        color: isConfirmed ? "#0f766e" : "white",
        border: isConfirmed ? "1px solid #0d9488" : "none",
        borderRadius: 6,
        cursor: isConfirming ? "wait" : "pointer",
        fontSize: compact ? "var(--chakra-font-sizes-xs)" : "var(--chakra-font-sizes-sm)",
        fontWeight: 600,
        fontFamily: "inherit",
        boxShadow: isConfirmed ? "none" : "0 1px 2px rgba(13,148,136,0.25)",
      }}
    >
      {label}
    </button>
  );
};
