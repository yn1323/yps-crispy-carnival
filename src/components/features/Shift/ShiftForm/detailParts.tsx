import { Box, chakra, Flex, Icon, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { LuCoffee, LuSettings2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { resolveDefaultPosition } from "@/src/domains/shift/operations";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { formatStaffWorkTotal } from "@/src/domains/shift/workTotals";
import {
  breakToolActiveAtom,
  detailModeAtom,
  isBreakToolActiveAtom,
  isPositionSelectableAtom,
  isToolPaletteActiveAtom,
  selectedPositionIdAtom,
  shiftConfigAtom,
  staffWorkTotalsAtom,
  usesPositionColorsAtom,
} from "./stores";
import type { ShiftFormDayRequirements } from "./types";

// ==========================================
// 画面の外へ出す操作（設定ページへの移動、その日の必要人数、仮の勤務）
// ==========================================
/** その日の必要人数を変える操作。どちらも、成功したらtrueを返す。失敗は呼び出し先が利用者へ伝える。 */
export type ShiftFormDayStaffingActions = {
  /** 選んだ日へ型を当てる。nullは、その日だけの指定を消して曜日の設定へ戻す。 */
  onApplyTemplate: (dates: string[], templateId: string | null) => Promise<boolean>;
  /** その日だけの必要人数を保存する。型は変えない。 */
  onSaveCustom: (date: string, requirements: ShiftFormDayRequirements) => Promise<boolean>;
  /** どちらかの操作を処理している間はtrue。 */
  isPending: boolean;
};

export type ShiftFormDetailActions = {
  /** 「シフト作成の設定」を開く。渡さない場合は導線を出さない。 */
  onOpenSetup?: () => void;
  /** その日の必要人数を変える操作。渡さない場合は、型の名前だけを出す。 */
  dayStaffingActions?: ShiftFormDayStaffingActions;
  /** 未提出者へ前回の勤務を仮で入れる。前回確定した募集がない場合は渡さない。 */
  provisionalAction?: { onInsert: () => void; isLoading: boolean };
};

const ShiftFormDetailActionsContext = createContext<ShiftFormDetailActions>({});

export const ShiftFormDetailActionsProvider = ({
  actions,
  children,
}: {
  actions: ShiftFormDetailActions;
  children: ReactNode;
}) => <ShiftFormDetailActionsContext.Provider value={actions}>{children}</ShiftFormDetailActionsContext.Provider>;

export const useShiftFormDetailActions = () => useContext(ShiftFormDetailActionsContext);

// ==========================================
// シンプル / くわしく の切り替え
// ==========================================
const DETAIL_MODE_OPTIONS = [
  { value: false, label: "シンプル" },
  { value: true, label: "くわしく" },
] as const;

/** シフト表の情報量を2段で切り替える。シンプルは従来の画面と同じ。 */
export const DetailModeToggle = () => {
  const [detailMode, setDetailMode] = useAtom(detailModeAtom);
  return (
    <Flex
      role="radiogroup"
      aria-label="表示の詳しさ"
      borderWidth="1px"
      borderColor="gray.300"
      borderRadius="md"
      overflow="hidden"
      flexShrink={0}
    >
      {DETAIL_MODE_OPTIONS.map((option) => {
        const checked = detailMode === option.value;
        return (
          <chakra.button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => setDetailMode(option.value)}
            h="32px"
            px={3}
            textStyle="xs"
            fontWeight={checked ? 700 : 500}
            bg={checked ? "gray.800" : "white"}
            color={checked ? "white" : "gray.600"}
            cursor="pointer"
            whiteSpace="nowrap"
            transitionProperty="colors"
            transitionDuration="faster"
            _active={checked ? undefined : { bg: "gray.100", transitionDuration: "0ms" }}
            _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
          >
            {option.label}
          </chakra.button>
        );
      })}
    </Flex>
  );
};

// ==========================================
// 入れるもの（ポジションまたは休憩）の選択
// ==========================================
const toolChipBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  h: "32px",
  px: 3,
  borderRadius: "full",
  borderWidth: "1px",
  textStyle: "xs",
  fontWeight: 600,
  whiteSpace: "nowrap",
  flexShrink: 0,
  cursor: "pointer",
  position: "relative",
  transitionProperty: "colors",
  transitionDuration: "faster",
  // 見た目は小さく保ち、押せる範囲だけを高さ44pxまで広げる。
  _after: { content: '""', position: "absolute", insetX: 0, insetY: "-6px" },
  _focusVisible: { outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" },
} as const;

/** くわしく表示の編集中に、これから入れるポジションまたは休憩を選ぶ。 */
export const ToolPalette = () => {
  const isActive = useAtomValue(isToolPaletteActiveAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  const isBreakTool = useAtomValue(isBreakToolActiveAtom);
  const config = useAtomValue(shiftConfigAtom);
  const [selectedPositionId, setSelectedPositionId] = useAtom(selectedPositionIdAtom);
  const setBreakTool = useSetAtom(breakToolActiveAtom);
  const { onOpenSetup } = useShiftFormDetailActions();

  if (!isActive || config.positions.length === 0) return null;

  const defaultPosition = resolveDefaultPosition(config.positions);
  const activePositionId = selectedPositionId ?? defaultPosition.id;
  // ポジションが1つだけの店舗では、勤務と休憩の2つだけを選ばせる。
  const positions = isPositionSelectable ? config.positions : [defaultPosition];

  return (
    <Flex
      align="center"
      gap={2}
      px={{ base: 3, lg: 5 }}
      py={2}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
      flexShrink={0}
      minW={0}
    >
      <Text textStyle="xs" color="gray.600" flexShrink={0} display={{ base: "none", lg: "block" }}>
        入れるもの
      </Text>
      <Flex role="radiogroup" aria-label="入れるもの" gap={2} overflowX="auto" flex={1} minW={0} py="6px" my="-6px">
        {positions.map((position) => {
          const checked = !isBreakTool && activePositionId === position.id;
          return (
            <chakra.button
              key={position.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                setSelectedPositionId(position.id);
                setBreakTool(false);
              }}
              css={toolChipBaseStyle}
              bg={checked ? position.color : "white"}
              color={checked ? "white" : "gray.700"}
              borderColor={checked ? position.color : "gray.300"}
              _active={checked ? undefined : { bg: "gray.100", transitionDuration: "0ms" }}
            >
              <Box boxSize="10px" borderRadius="full" bg={checked ? "white" : position.color} flexShrink={0} />
              {position.name}
            </chakra.button>
          );
        })}
        <chakra.button
          type="button"
          role="radio"
          aria-checked={isBreakTool}
          onClick={() => setBreakTool(true)}
          css={toolChipBaseStyle}
          bg={isBreakTool ? "gray.700" : "white"}
          color={isBreakTool ? "white" : "gray.700"}
          borderColor={isBreakTool ? "gray.700" : "gray.300"}
          borderStyle={isBreakTool ? "solid" : "dashed"}
          _active={isBreakTool ? undefined : { bg: "gray.100", transitionDuration: "0ms" }}
        >
          <Icon boxSize={3.5} aria-hidden>
            <LuCoffee />
          </Icon>
          休憩
        </chakra.button>
      </Flex>
      {isBreakTool && (
        <Text textStyle="xs" color="gray.600" flexShrink={0} display={{ base: "none", lg: "block" }}>
          勤務を押すと、休憩を入れられます
        </Text>
      )}
      {onOpenSetup && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          h="32px"
          px={2}
          gap={1}
          flexShrink={0}
          color="gray.700"
          onClick={onOpenSetup}
        >
          <Icon boxSize={4} aria-hidden>
            <LuSettings2 />
          </Icon>
          <Box as="span" display={{ base: "none", lg: "inline" }}>
            シフト作成の設定
          </Box>
          <Box as="span" display={{ base: "inline", lg: "none" }}>
            設定
          </Box>
        </Button>
      )}
    </Flex>
  );
};

/**
 * ポジションの色の凡例。閲覧専用の表示で、色がどのポジションを表すかを示す。
 * 編集できる表示では「入れるもの」が凡例を兼ねるため出さない。
 */
export const PositionLegend = () => {
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const isToolPaletteActive = useAtomValue(isToolPaletteActiveAtom);
  const { positions } = useAtomValue(shiftConfigAtom);
  if (!usesPositionColors || isToolPaletteActive) return null;

  return (
    <Flex
      as="ul"
      aria-label="ポジション"
      listStyleType="none"
      align="center"
      columnGap={4}
      rowGap={1}
      flexWrap="wrap"
      px={{ base: 3, lg: 5 }}
      py={2}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
      flexShrink={0}
    >
      {positions.map((position) => (
        <Flex as="li" key={position.id} align="center" gap="6px" textStyle="xs" color="gray.700" fontWeight={600}>
          <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
          {position.name}
        </Flex>
      ))}
    </Flex>
  );
};

// ==========================================
// 勤務の色
// ==========================================
/** 勤務を塗る色。くわしく表示でポジションが2つ以上ある場合だけ、ポジションの色を返す。 */
export const useWorkColor = () => {
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  return useMemo(
    () => (segment: { color: string } | undefined, fallback: string) =>
      usesPositionColors && segment ? segment.color : fallback,
    [usesPositionColors],
  );
};

/**
 * 勤務のポジションを、色の丸と名前で示す。
 * ポジションを塗り分ける表示（くわしく表示で、ポジションが2つ以上）のときだけ出す。
 */
export const PositionMark = ({
  segment,
  onColor = false,
}: {
  segment: { positionName: string; color: string } | undefined;
  /** 色の付いた面の上に置く場合はtrue。丸を白にして見分けられるようにする。 */
  onColor?: boolean;
}) => {
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  if (!usesPositionColors || !segment) return null;
  return (
    <Flex as="span" align="center" gap="4px" minW={0} textStyle="2xs" fontWeight={600} lineHeight={1.2}>
      <Box
        as="span"
        boxSize="8px"
        borderRadius="full"
        flexShrink={0}
        style={{ background: onColor ? "#ffffff" : segment.color }}
        aria-hidden
      />
      <Box as="span" truncate>
        {segment.positionName}
      </Box>
    </Flex>
  );
};

/** その日の休憩を、アイコンと時刻で示す。くわしく表示で、休憩がある日だけ出す。 */
export const BreakMark = ({ shift, compact = false }: { shift: ShiftData | undefined; compact?: boolean }) => {
  const detailMode = useAtomValue(detailModeAtom);
  const isDateOnly = useAtomValue(shiftConfigAtom).submissionPattern.kind === "dateOnly";
  if (!detailMode || !shift) return null;
  const breaks = getEffectiveBreaks(shift, { clipToWork: !isDateOnly });
  if (breaks.length === 0) return null;
  const label = breaks.map((range) => formatShiftClockTimeRange(range.start, range.end)).join(" / ");
  return (
    <Flex
      as="span"
      align="center"
      gap="4px"
      minW={0}
      textStyle="2xs"
      color="gray.600"
      title={`休憩 ${label}`}
      aria-label={`休憩 ${label}`}
    >
      <Icon boxSize={3} flexShrink={0} aria-hidden>
        <LuCoffee />
      </Icon>
      {!compact && (
        <Box as="span" truncate fontVariantNumeric="tabular-nums">
          {label}
        </Box>
      )}
    </Flex>
  );
};

// ==========================================
// スタッフ名に添える印（熟練度、仮の勤務、合計）
// ==========================================
const SKILL_LABELS = { newcomer: "新人", lead: "責任者" } as const;
const SKILL_STYLES = {
  newcomer: { bg: "orange.100", color: "orange.800" },
  lead: { bg: "green.100", color: "green.800" },
} as const;

const MetaBadge = ({ bg, color, children }: { bg: string; color: string; children: ReactNode }) => (
  <Box px="6px" py="1px" borderRadius="full" bg={bg} color={color} textStyle="2xs" fontWeight={700} flexShrink={0}>
    {children}
  </Box>
);

/**
 * くわしく表示のときだけ、スタッフ名に添える印を出す。
 * `shift`には、表示中の日の勤務を渡す。週や期間を並べる表では渡さない。
 */
export const StaffMeta = ({
  staff,
  shift,
  showTotal = true,
}: {
  staff: StaffType;
  shift?: ShiftData;
  showTotal?: boolean;
}) => {
  const detailMode = useAtomValue(detailModeAtom);
  const totals = useAtomValue(staffWorkTotalsAtom);
  const isConfirmedDisplay = useAtomValue(shiftConfigAtom).displayMode === "confirmed";
  if (!detailMode) return null;

  // 人ごとの合計は担当者が偏りを確かめるためのもので、スタッフ向けの確定シフト表示には出さない。
  const total = isConfirmedDisplay ? undefined : totals.get(staff.id);
  const hasContent = staff.skillLevel || shift?.isProvisional || (showTotal && total);
  if (!hasContent) return null;

  return (
    <Flex align="center" gap={1} minW={0} flexWrap="nowrap">
      {staff.skillLevel && <MetaBadge {...SKILL_STYLES[staff.skillLevel]}>{SKILL_LABELS[staff.skillLevel]}</MetaBadge>}
      {shift?.isProvisional && (
        <Box
          px="6px"
          py="0"
          borderRadius="full"
          borderWidth="1px"
          borderStyle="dashed"
          borderColor="gray.500"
          color="gray.700"
          textStyle="2xs"
          fontWeight={700}
          flexShrink={0}
          title="前回の勤務を仮で入れています"
        >
          仮
        </Box>
      )}
      {showTotal && total && (
        <Text textStyle="2xs" color="gray.600" fontVariantNumeric="tabular-nums" whiteSpace="nowrap">
          計 {formatStaffWorkTotal(total)}
        </Text>
      )}
    </Flex>
  );
};
