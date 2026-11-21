import { Box, chakra, Flex, Icon, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { LuCoffee, LuSettings2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { isPositionsUnsplit, resolveDefaultPosition } from "@/src/domains/shift/operations";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { formatStaffWorkTotal } from "@/src/domains/shift/workTotals";
import { buildNameSkillMark, type NameSkillMarkView, UNAVAILABLE_MARK_COLORS } from "./skillPresentation";
import {
  breakToolActiveAtom,
  detailModeAtom,
  isBreakToolActiveAtom,
  isPositionSelectableAtom,
  isRangeAssignHintDismissedAtom,
  isToolPaletteActiveAtom,
  nameSkillPositionAtom,
  nextWorkPositionAtom,
  paintsPositionColorAtom,
  rememberWorkPositionAtom,
  selectedPositionIdAtom,
  shiftConfigAtom,
  staffWorkTotalsAtom,
  usesPositionColorsAtom,
} from "./stores";

// ==========================================
// 画面の外へ出す操作（設定ページへの移動、その日の必要人数、仮の勤務）
// ==========================================
/** その日の必要人数を変える操作。成功したらtrueを返す。失敗は呼び出し先が利用者へ伝える。 */
export type ShiftFormDayStaffingActions = {
  /**
   * 選んだ日へテンプレートを当てる。nullは、その日だけの指定を消して曜日の設定へ戻す。
   * NO_DAY_TEMPLATE（"none"）は、その日にテンプレートを当てない。
   */
  onApplyTemplate: (dates: string[], templateId: string | null) => Promise<boolean>;
  /** 処理している間はtrue。 */
  isPending: boolean;
};

export type ShiftFormDetailActions = {
  /** 「シフト作成の設定」を開く。渡さない場合は導線を出さない。 */
  onOpenSetup?: () => void;
  /** その日の必要人数を変える操作。渡さない場合は、テンプレートの名前だけを出す。 */
  dayStaffingActions?: ShiftFormDayStaffingActions;
  /** 未提出者へ前回の勤務を仮で入れる。前回確定した募集がない場合は渡さない。 */
  provisionalAction?: { onInsert: () => void; isLoading: boolean };
  /**
   * 「シンプル / くわしく」の切り替えを、画面の外で受け付ける。渡した場合、表示設定で選んでも、その場では切り替えない。
   * 切り替えで下書きを削除する画面が、確認してから開き直すために使う。
   */
  requestDetailModeChange?: (isDetailMode: boolean) => void;
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

/**
 * くわしく表示の編集中に、これから入れるポジションまたは休憩を選ぶ。
 * `inline`は、パターン選択のPCの日別表示の日付の見出しへ置く形で、選択肢だけを出す。行を1つ減らすためである。
 * 時間指定のPCの日別表示は、勤務のバーの範囲を選んでから入れるため、代わりに`RangeAssignPalette`を置く。
 * `row`は、それ以外の表示で使う、ヘッダーの下の1行である。
 */
export const ToolPalette = ({ variant = "row" }: { variant?: "row" | "inline" }) => {
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
  // ポジションを分けていない店舗では、仮の名前「シフト」を出さず、休憩だけを出す。休憩は押すたびに入り切りする。
  const isUnsplit = isPositionsUnsplit(config.positions);
  // ポジションが1つだけの店舗では、勤務と休憩の2つだけを選ばせる。
  const positions = isUnsplit ? [] : isPositionSelectable ? config.positions : [defaultPosition];

  const choices = (
    <Flex
      role={isUnsplit ? "group" : "radiogroup"}
      aria-label="入れるもの"
      gap={2}
      overflowX="auto"
      flex={variant === "row" ? 1 : undefined}
      minW={0}
      py="6px"
      my="-6px"
    >
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
        role={isUnsplit ? undefined : "radio"}
        aria-checked={isUnsplit ? undefined : isBreakTool}
        aria-pressed={isUnsplit ? isBreakTool : undefined}
        onClick={() => setBreakTool(isUnsplit ? !isBreakTool : true)}
        css={toolChipBaseStyle}
        bg={isBreakTool ? "teal.600" : "white"}
        color={isBreakTool ? "white" : "gray.700"}
        borderColor={isBreakTool ? "teal.600" : "gray.300"}
        borderStyle={isBreakTool ? "solid" : "dashed"}
        _active={isBreakTool ? undefined : { bg: "gray.100", transitionDuration: "0ms" }}
      >
        <Icon boxSize={3.5} aria-hidden>
          <LuCoffee />
        </Icon>
        休憩
      </chakra.button>
    </Flex>
  );
  if (variant === "inline") return choices;

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
      {choices}
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

const PositionLegendItem = ({ position }: { position: { name: string; color: string } }) => (
  <Flex as="li" align="center" gap="6px" textStyle="xs" color="gray.700" fontWeight={600} whiteSpace="nowrap">
    <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
    {position.name}
  </Flex>
);

// 休憩の見本。勤務のバーの内側に出す休憩と同じ、灰色の斜線にする。
const BREAK_SWATCH_STYLE = {
  backgroundColor: "#f9fafb",
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(107,114,128,0.7), rgba(107,114,128,0.7) 2px, transparent 2px, transparent 5px)",
};

// 凡例に近い見た目の選択肢。選んでいるものは薄い塗りで示し、枠は付けない。
const rangeChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  h: "28px",
  px: "10px",
  borderRadius: "full",
  textStyle: "xs",
  fontWeight: 600,
  color: "gray.700",
  whiteSpace: "nowrap",
  flexShrink: 0,
  cursor: "pointer",
  position: "relative",
  transitionProperty: "colors",
  transitionDuration: "faster",
  // 見た目は小さく保ち、押せる範囲だけを高さ44pxまで広げる。
  _after: { content: '""', position: "absolute", insetX: 0, insetY: "-8px" },
  _focusVisible: { outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" },
} as const;
const rangeChipIdleStyle = {
  _hover: { bg: "gray.100" },
  _active: { bg: "gray.200", transitionDuration: "0ms" },
} as const;

/**
 * 時間指定のPCの日別表示で、日付の見出しに置く、次に入れるものの選択と案内。
 * ポジションを押すと、次に新しく入れる勤務のポジションが変わる。勤務のバーのメニューでポジションを選んだときも、同じ選択が変わる。
 * 「休憩」を押すと、勤務のバーの上をなぞった範囲が休憩になる。メニューで休憩を選んでも、この選択は変わらない。
 * 選んだポジションは店舗ごとに端末へ覚える。休憩の選択は覚えず、開き直すとポジションの選択に戻る。
 * 案内は、一度でも範囲を選んで入れた端末では出さない。
 */
export const RangeAssignPalette = () => {
  const isActive = useAtomValue(isToolPaletteActiveAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  const isBreakTool = useAtomValue(isBreakToolActiveAtom);
  const nextWorkPosition = useAtomValue(nextWorkPositionAtom);
  const { positions } = useAtomValue(shiftConfigAtom);
  const isHintDismissed = useAtomValue(isRangeAssignHintDismissedAtom);
  const rememberWorkPosition = useSetAtom(rememberWorkPositionAtom);
  const setBreakTool = useSetAtom(breakToolActiveAtom);
  if (!isActive) return null;

  // ポジションを分けていない店舗では、仮の名前「シフト」を出さず、休憩だけを出す。休憩は押すたびに入り切りする。
  const isUnsplit = isPositionsUnsplit(positions);
  // ポジションが1つだけの店舗では、勤務と休憩の2つだけを選ばせる。
  const choices = isUnsplit ? [] : isPositionSelectable ? positions : [nextWorkPosition];
  return (
    // くわしく表示へ切り替えたときに、勤務のバーの色と合わせて、ふわっと出す。
    <Flex align="center" gap={4} minW={0} animation="fade-in 320ms ease-out" _motionReduce={{ animation: "none" }}>
      {!isHintDismissed && (
        <Text textStyle="xs" color="gray.600" whiteSpace="nowrap">
          {isUnsplit ? "バーをなぞると 休憩を入れられます" : "バーをなぞると ポジションを変えられます"}
        </Text>
      )}
      <Flex
        role={isUnsplit ? "group" : "radiogroup"}
        aria-label="入れるもの"
        align="center"
        gap={1}
        minW={0}
        overflowX="auto"
        py="8px"
        my="-8px"
      >
        {choices.map((position) => {
          const checked = !isBreakTool && position.id === nextWorkPosition.id;
          return (
            <chakra.button
              key={position.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => rememberWorkPosition(position.id)}
              css={rangeChipStyle}
              {...(checked ? {} : rangeChipIdleStyle)}
              style={checked ? { background: `color-mix(in srgb, ${position.color} 22%, white)` } : undefined}
            >
              <Box
                boxSize="10px"
                borderRadius="full"
                flexShrink={0}
                style={{ background: position.color }}
                aria-hidden
              />
              {position.name}
            </chakra.button>
          );
        })}
        <chakra.button
          type="button"
          role={isUnsplit ? undefined : "radio"}
          aria-checked={isUnsplit ? undefined : isBreakTool}
          aria-pressed={isUnsplit ? isBreakTool : undefined}
          onClick={() => setBreakTool(isUnsplit ? !isBreakTool : true)}
          css={rangeChipStyle}
          {...(isBreakTool ? { bg: "gray.200" } : rangeChipIdleStyle)}
        >
          <Box w="14px" h="10px" borderRadius="2px" flexShrink={0} style={BREAK_SWATCH_STYLE} aria-hidden />
          休憩
        </chakra.button>
      </Flex>
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
        <PositionLegendItem key={position.id} position={position} />
      ))}
    </Flex>
  );
};

// ==========================================
// 勤務の色
// ==========================================
/** 勤務のバーを塗る色。くわしく表示で、名前を付けたポジションがある店舗では、ポジションが1つでもポジションの色を返す。 */
export const useWorkColor = () => {
  const paintsPositionColor = useAtomValue(paintsPositionColorAtom);
  return useMemo(
    () => (segment: { color: string } | undefined, fallback: string) =>
      paintsPositionColor && segment ? segment.color : fallback,
    [paintsPositionColor],
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
  segment: { positionId: string; positionName: string; color: string } | undefined;
  /** 色の付いた面の上に置く場合はtrue。丸を白にして見分けられるようにする。 */
  onColor?: boolean;
}) => {
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  // ポジションが1つの店舗では、色と名前を出さない。
  if (!segment || !usesPositionColors) return null;
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
/** 名前の横の担当外の印。ポジションが2つ以上の店舗では、どのポジションでの値かを色の丸で添える。 */
const NameSkillBadge = ({ mark }: { mark: NameSkillMarkView }) => (
  <Flex
    as="span"
    align="center"
    gap="4px"
    px="6px"
    py="1px"
    borderRadius="full"
    textStyle="2xs"
    fontWeight={700}
    flexShrink={0}
    title={mark.title ?? undefined}
    data-skill-badge={mark.level}
    {...UNAVAILABLE_MARK_COLORS}
  >
    {mark.position && (
      <>
        <Box
          as="span"
          boxSize="8px"
          borderRadius="full"
          flexShrink={0}
          style={{ background: mark.position.color }}
          aria-hidden
        />
        <chakra.span srOnly>{mark.position.name}：</chakra.span>
      </>
    )}
    {mark.label}
  </Flex>
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
  const config = useAtomValue(shiftConfigAtom);
  const skillPosition = useAtomValue(nameSkillPositionAtom);
  if (!detailMode) return null;

  // 人ごとの合計は担当者が偏りを確かめるためのもので、スタッフ向けの確定シフト表示には出さない。
  const total = config.displayMode === "confirmed" ? undefined : totals.get(staff.id);
  // 担当外は「入れるもの」で選んでいるポジションでの値を出す。勤務を入れる前に、担当外のポジションが分かるようにする。
  const skillMark = buildNameSkillMark({ staff, position: skillPosition, positionCount: config.positions.length });
  const hasContent = skillMark || shift?.isProvisional || (showTotal && total);
  if (!hasContent) return null;

  return (
    <Flex align="center" gap={1} minW={0} flexWrap="nowrap">
      {skillMark && <NameSkillBadge mark={skillMark} />}
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
