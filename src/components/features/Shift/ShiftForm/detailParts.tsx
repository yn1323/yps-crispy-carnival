import { Box, chakra, Flex, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { LuCheck, LuChevronDown, LuCoffee, LuSettings2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { resolveDefaultPosition } from "@/src/domains/shift/operations";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { formatStaffWorkTotal } from "@/src/domains/shift/workTotals";
import {
  buildDayStaffingView,
  type DayStaffingView,
  formatStaffingCount,
  selectStaffingShifts,
} from "./staffingPresentation";
import {
  breakToolActiveAtom,
  detailModeAtom,
  isBreakToolActiveAtom,
  isPositionSelectableAtom,
  isToolPaletteActiveAtom,
  selectedPositionIdAtom,
  shiftConfigAtom,
  shiftsAtom,
  staffWorkTotalsAtom,
  usesPositionColorsAtom,
} from "./stores";

// ==========================================
// 画面の外へ出す操作（設定ページへの移動、特別な日、仮の勤務）
// ==========================================
export type ShiftFormDetailActions = {
  /** 「シフト作成の設定」を開く。渡さない場合は導線を出さない。 */
  onOpenSetup?: () => void;
  /** その日に当てる日の型を変える。nullで曜日の割り当てへ戻す。 */
  onChangeDayTemplate?: (date: string, templateId: string | null) => void;
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

// ==========================================
// 人数と過不足
// ==========================================
/** その日の人数と過不足を、表示用にまとめて返す。くわしく表示でない場合はnullを返す。 */
export const useDayStaffingView = (date: string): DayStaffingView | null => {
  const detailMode = useAtomValue(detailModeAtom);
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  return useMemo(() => {
    // スタッフ向けの確定シフト表示には、人数と過不足を出さない。
    if (!detailMode || !date || config.holidays.includes(date) || config.displayMode === "confirmed") return null;
    return buildDayStaffingView({
      date,
      shifts: selectStaffingShifts(shifts, config.staffs, date),
      positions: config.positions,
      submissionPattern: config.submissionPattern,
      timeRange: config.timeRange,
      staffing: config.staffing,
    });
  }, [detailMode, date, config, shifts]);
};

const ShortageMark = ({ shortage }: { shortage: number }) =>
  shortage > 0 ? (
    <Box as="span" color="red.600" fontWeight={700} whiteSpace="nowrap">
      ▲{shortage}
    </Box>
  ) : null;

/** ポジションごとの「人数 / 必要」。ポジションが1つだけの場合は名前を出さない。 */
export const StaffingPositionCounts = ({
  slot,
  showNames,
}: {
  slot: DayStaffingView["slots"][number];
  showNames: boolean;
}) => {
  // 必要人数が未設定で、誰も入っていないポジションは出さない。内訳を、見るべきポジションだけにする。
  const positions = slot.positions.filter((position) => position.required !== null || position.count > 0);
  if (slot.positions.length <= 1 || positions.length === 0) {
    const only = slot.positions.length <= 1 ? slot.positions[0] : undefined;
    return (
      <Flex as="span" align="center" gap={1} fontVariantNumeric="tabular-nums">
        {formatStaffingCount(only?.count ?? slot.total, only?.required ?? null)}
        <ShortageMark shortage={only?.shortage ?? 0} />
      </Flex>
    );
  }
  return (
    <Flex as="span" align="center" columnGap={2} rowGap={0} flexWrap="wrap" fontVariantNumeric="tabular-nums">
      {positions.map((position) => (
        <Flex as="span" key={position.positionId} align="center" gap={1} whiteSpace="nowrap">
          <Box boxSize="8px" borderRadius="full" bg={position.color} flexShrink={0} aria-hidden />
          {showNames ? <Box as="span">{position.name}</Box> : <chakra.span srOnly>{position.name}</chakra.span>}
          {formatStaffingCount(position.count, position.required)}
          <ShortageMark shortage={position.shortage} />
        </Flex>
      ))}
    </Flex>
  );
};

/** その日に当てる日の型を選ぶ（特別な日）。型が1つもない店舗では、設定への導線だけを出す。 */
export const DayTemplateMenu = ({ date, view }: { date: string; view: DayStaffingView }) => {
  const config = useAtomValue(shiftConfigAtom);
  const { onChangeDayTemplate, onOpenSetup } = useShiftFormDetailActions();
  const templates = config.staffing?.dayTemplates ?? [];

  if (templates.length === 0) {
    if (!onOpenSetup || config.isReadOnly) return null;
    return (
      <Button type="button" size="xs" variant="outline" h="28px" px={2} onClick={onOpenSetup} flexShrink={0}>
        必要人数を設定
      </Button>
    );
  }

  const label = view.template ? view.template.name : "型なし";
  if (!onChangeDayTemplate || config.isReadOnly) {
    return (
      <Text textStyle="xs" color="gray.600" flexShrink={0}>
        {label}
      </Text>
    );
  }

  return (
    <Menu.Root positioning={{ placement: "top-start", gutter: 6 }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          size="xs"
          variant="outline"
          h="28px"
          px={2}
          gap={1}
          flexShrink={0}
          maxW="160px"
          aria-label={`この日の型: ${label}`}
        >
          <Box as="span" truncate>
            {label}
          </Box>
          <LuChevronDown aria-hidden />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(240px, calc(100vw - 24px))">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel>この日の型</Menu.ItemGroupLabel>
              {templates.map((template) => {
                const checked = view.template?.id === template.id;
                return (
                  <Menu.Item
                    key={template.id}
                    value={template.id}
                    cursor="pointer"
                    py={2.5}
                    onClick={() => {
                      if (!checked) onChangeDayTemplate(date, template.id);
                    }}
                  >
                    <Box w={4} color="teal.600" flexShrink={0}>
                      {checked && <LuCheck aria-hidden />}
                    </Box>
                    <Menu.ItemText fontSize="sm">{template.name}</Menu.ItemText>
                  </Menu.Item>
                );
              })}
            </Menu.ItemGroup>
            {view.isOverridden && (
              <>
                <Menu.Separator />
                <Menu.Item value="reset" cursor="pointer" py={2.5} onClick={() => onChangeDayTemplate(date, null)}>
                  <Box w={4} flexShrink={0} />
                  <Menu.ItemText fontSize="sm">曜日の設定に戻す</Menu.ItemText>
                </Menu.Item>
              </>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

/**
 * その日の人数と過不足の一覧。スマートフォンの日別表示と、時間軸を持たないPCの表示で使う。
 * 不足のない区切りは畳めるようにし、不足がある区切りを先に目に入れる。
 */
export const StaffingSummary = ({ date, defaultExpanded = false }: { date: string; defaultExpanded?: boolean }) => {
  const view = useDayStaffingView(date);
  const [isExpanded, setExpanded] = useState(defaultExpanded);
  if (!view) return null;

  const shortageSlots = view.slots.filter((slot) => slot.hasShortage);
  const visibleSlots = isExpanded ? view.slots : shortageSlots;
  const hasHiddenSlots = view.slots.length > shortageSlots.length;
  // 型のない時間指定の日は1時間ごとの人数になるため、行ではなく詰めて並べる。
  const isHourly = view.template === null && view.slots.length > 0 && view.slots[0].startMinutes !== undefined;

  return (
    <Box
      as="section"
      aria-label="人数"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      px={3}
      py={2}
      textStyle="xs"
      color="gray.800"
    >
      <Flex align="center" justify="space-between" gap={2}>
        <Flex align="center" gap={2} minW={0}>
          <Text fontWeight={700} flexShrink={0}>
            人数
          </Text>
          {view.hasShortage ? (
            <Text color="red.600" fontWeight={700} flexShrink={0}>
              不足 {shortageSlots.length}か所
            </Text>
          ) : view.template ? (
            <Text color="gray.600" flexShrink={0}>
              不足なし
            </Text>
          ) : null}
        </Flex>
        <Flex align="center" gap={1} flexShrink={0}>
          <DayTemplateMenu date={date} view={view} />
          {hasHiddenSlots && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              h="28px"
              px={2}
              aria-expanded={isExpanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {isExpanded ? "閉じる" : "すべて見る"}
            </Button>
          )}
        </Flex>
      </Flex>
      {visibleSlots.length > 0 &&
        (isHourly ? (
          <Flex mt={2} gap={1} flexWrap="wrap">
            {visibleSlots.map((slot) => (
              <Flex
                key={slot.id}
                direction="column"
                align="center"
                minW="32px"
                px={1}
                py="2px"
                borderRadius="sm"
                bg="gray.50"
                fontVariantNumeric="tabular-nums"
              >
                <Box color="gray.500" textStyle="2xs">
                  {Math.floor((slot.startMinutes ?? 0) / 60)}時
                </Box>
                <Box fontWeight={600}>{slot.total}</Box>
              </Flex>
            ))}
          </Flex>
        ) : (
          <Box mt={2}>
            {visibleSlots.map((slot) => (
              <Flex
                key={slot.id}
                align="baseline"
                justify="space-between"
                gap={3}
                py="3px"
                borderTopWidth="1px"
                borderColor="gray.100"
              >
                <Text flexShrink={0} color="gray.700" fontVariantNumeric="tabular-nums">
                  {slot.label}
                </Text>
                <StaffingPositionCounts slot={slot} showNames />
              </Flex>
            ))}
          </Box>
        ))}
    </Box>
  );
};
