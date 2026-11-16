import { Box, chakra, Flex, Menu, Portal, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useState } from "react";
import { LuCheck, LuChevronDown } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { useShiftFormDetailActions } from "./detailParts";
import {
  type DayStaffingView,
  STAFFING_TONE_STYLES,
  type StaffingCountView,
  type StaffingSlotView,
} from "./staffingPresentation";
import { canEditDayStaffingAtom, dayStaffingDialogAtom, dayStaffingViewByDateAtom, shiftConfigAtom } from "./stores";

// 人数と過不足、その日の型のメニュー。くわしく表示のときだけ出す。

/** その日の人数と過不足を返す。くわしく表示でない場合、定休日、スタッフ向けの確定シフト表示ではnullを返す。 */
export const useDayStaffingView = (date: string): DayStaffingView | null =>
  useAtomValue(dayStaffingViewByDateAtom).get(date) ?? null;

/** その日の必要人数を変える操作。閲覧専用、確定済み、操作を受け取っていない画面ではnullを返す。 */
export const useDayStaffingEditor = () => {
  const canEdit = useAtomValue(canEditDayStaffingAtom);
  const { dayStaffingActions } = useShiftFormDetailActions();
  return canEdit && dayStaffingActions ? dayStaffingActions : null;
};

// ==========================================
// 人数の表示
// ==========================================
/** 新人だけの時間帯の印。スタッフ名の「新人」バッジと同じ配色にする。 */
export const NewcomerOnlyMark = () => (
  <Box
    as="span"
    px="3px"
    borderRadius="sm"
    bg="orange.100"
    color="orange.800"
    textStyle="2xs"
    fontWeight={700}
    lineHeight={1.4}
    flexShrink={0}
    title="新人だけ"
  >
    新<chakra.span srOnly>人だけ</chakra.span>
  </Box>
);

/** 「2/3 ▲1」の形の人数。足りない場合は赤の地と実線の枠、多い場合は青の地と点線の枠で示す。 */
export const StaffingCountChip = ({ view }: { view: StaffingCountView }) => {
  const style = STAFFING_TONE_STYLES[view.tone];
  return (
    <Flex as="span" align="center" gap="3px" whiteSpace="nowrap">
      <Box
        as="span"
        px={style.bg ? "4px" : 0}
        borderRadius="sm"
        borderWidth="1px"
        bg={style.bg}
        borderColor={style.borderColor}
        borderStyle={style.borderStyle}
        color={style.color}
        fontWeight={style.fontWeight}
        fontVariantNumeric="tabular-nums"
      >
        {view.label}
      </Box>
      {view.isNewcomerOnly && <NewcomerOnlyMark />}
    </Flex>
  );
};

/** ポジションごとの「人数 / 必要」。ポジションが1つだけの場合は名前を出さない。 */
export const StaffingPositionCounts = ({ slot, showNames }: { slot: StaffingSlotView; showNames: boolean }) => {
  // 必要人数が未設定で、誰も入っていないポジションは出さない。内訳を、見るべきポジションだけにする。
  const positions = slot.positions.filter((position) => position.required !== null || position.count > 0);
  if (slot.positions.length <= 1 || positions.length === 0) {
    const only = slot.positions.length <= 1 ? slot.positions[0] : undefined;
    return only ? (
      <StaffingCountChip view={only} />
    ) : (
      <Box as="span" color="gray.600" fontWeight={600} fontVariantNumeric="tabular-nums">
        {slot.total}
      </Box>
    );
  }
  return (
    <Flex as="span" align="center" columnGap={2} rowGap="2px" flexWrap="wrap" justify="center">
      {positions.map((position) => (
        <Flex as="span" key={position.positionId} align="center" gap={1} whiteSpace="nowrap">
          <Box boxSize="8px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
          {showNames ? (
            <Box as="span" color="gray.700">
              {position.name}
            </Box>
          ) : (
            <chakra.span srOnly>{position.name}</chakra.span>
          )}
          <StaffingCountChip view={position} />
        </Flex>
      ))}
    </Flex>
  );
};

const LegendItem = ({ swatch, children }: { swatch: ReactNode; children: ReactNode }) => (
  <Flex as="li" align="center" gap="6px" whiteSpace="nowrap">
    {swatch}
    {children}
  </Flex>
);

const LegendSwatch = ({ tone }: { tone: "shortage" | "excess" }) => {
  const style = STAFFING_TONE_STYLES[tone];
  return (
    <Box
      boxSize="14px"
      borderRadius="sm"
      borderWidth="1px"
      bg={style.bg}
      borderColor={style.borderColor}
      borderStyle={style.borderStyle}
      flexShrink={0}
      aria-hidden
    />
  );
};

/** 過不足の色と記号、新人だけの印の凡例。 */
export const StaffingLegend = ({
  showsImbalance,
  showsNewcomer,
}: {
  showsImbalance: boolean;
  showsNewcomer: boolean;
}) => {
  if (!showsImbalance && !showsNewcomer) return null;
  return (
    <Flex
      as="ul"
      aria-label="人数の凡例"
      listStyleType="none"
      align="center"
      columnGap={4}
      rowGap={1}
      flexWrap="wrap"
      textStyle="2xs"
      color="gray.600"
    >
      {showsImbalance && (
        <>
          <LegendItem swatch={<LegendSwatch tone="shortage" />}>足りない ▲</LegendItem>
          <LegendItem swatch={<LegendSwatch tone="excess" />}>多い ＋</LegendItem>
        </>
      )}
      {showsNewcomer && (
        <LegendItem
          swatch={
            <Box as="span" aria-hidden>
              <NewcomerOnlyMark />
            </Box>
          }
        >
          新人だけの時間
        </LegendItem>
      )}
    </Flex>
  );
};

// ==========================================
// その日の型のメニュー
// ==========================================
const MENU_ITEM_PROPS = { cursor: "pointer", py: 2.5 } as const;

/** その日の型のメニューの項目。型を当てる、この日だけ変える、まとめて変える、曜日の設定に戻す、設定を開く。 */
export const DayTemplateMenuItems = ({ date, view }: { date: string; view: DayStaffingView }) => {
  const config = useAtomValue(shiftConfigAtom);
  const editor = useDayStaffingEditor();
  const { onOpenSetup } = useShiftFormDetailActions();
  const openDialog = useSetAtom(dayStaffingDialogAtom);
  const templates = config.staffing?.templates ?? [];
  if (!editor) return null;

  return (
    <>
      {templates.length > 0 && (
        <>
          <Menu.ItemGroup>
            <Menu.ItemGroupLabel>この日の型</Menu.ItemGroupLabel>
            {templates.map((template) => {
              const checked = view.template.templateId === template.id;
              return (
                <Menu.Item
                  key={template.id}
                  value={`template:${template.id}`}
                  {...MENU_ITEM_PROPS}
                  onClick={() => {
                    if (!checked) void editor.onApplyTemplate([date], template.id);
                  }}
                >
                  <Box w={4} color="teal.600" flexShrink={0}>
                    {checked && <LuCheck aria-label="選択中" />}
                  </Box>
                  <Menu.ItemText fontSize="sm">{template.name}</Menu.ItemText>
                </Menu.Item>
              );
            })}
          </Menu.ItemGroup>
          <Menu.Separator />
        </>
      )}
      <Menu.Item value="custom" {...MENU_ITEM_PROPS} onClick={() => openDialog({ kind: "custom", date })}>
        <Box w={4} flexShrink={0} />
        <Menu.ItemText fontSize="sm">この日だけ人数を変える</Menu.ItemText>
      </Menu.Item>
      {templates.length > 0 && (
        <Menu.Item value="bulk" {...MENU_ITEM_PROPS} onClick={() => openDialog({ kind: "bulk", date })}>
          <Box w={4} flexShrink={0} />
          <Menu.ItemText fontSize="sm">ほかの日もまとめて変える</Menu.ItemText>
        </Menu.Item>
      )}
      {view.template.isDateSpecific && (
        <Menu.Item value="reset" {...MENU_ITEM_PROPS} onClick={() => void editor.onApplyTemplate([date], null)}>
          <Box w={4} flexShrink={0} />
          <Menu.ItemText fontSize="sm">曜日の設定に戻す</Menu.ItemText>
        </Menu.Item>
      )}
      {onOpenSetup && (
        <>
          <Menu.Separator />
          <Menu.Item value="setup" {...MENU_ITEM_PROPS} onClick={onOpenSetup}>
            <Box w={4} flexShrink={0} />
            <Menu.ItemText fontSize="sm">シフト作成の設定を開く</Menu.ItemText>
          </Menu.Item>
        </>
      )}
    </>
  );
};

/**
 * その日の型の名前と、型を変えるメニュー。人数の見出しに1つだけ置く。
 * 閲覧専用と確定済みでは、名前だけを出す。
 */
export const DayTemplateMenu = ({ date, view }: { date: string; view: DayStaffingView }) => {
  const editor = useDayStaffingEditor();
  const label = view.template.label;

  if (!editor) {
    return (
      <Text textStyle="xs" color="gray.600" flexShrink={0} truncate maxW="200px">
        <chakra.span srOnly>この日の型: </chakra.span>
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
          maxW="200px"
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
          <Menu.Content w="min(260px, calc(100vw - 24px))">
            <DayTemplateMenuItems date={date} view={view} />
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

/** 必要人数がない日に、人数だけを出していることを伝える。 */
export const StaffingUnsetNote = () => (
  <Text textStyle="xs" color="gray.600" flexShrink={0} whiteSpace="nowrap">
    必要人数が未設定
  </Text>
);

// ==========================================
// 人数のカード（時間の軸を持たない表示）
// ==========================================
const SummaryRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <Flex as="li" align="center" justify="space-between" gap={3} py="3px" borderTopWidth="1px" borderColor="gray.100">
    <Text flexShrink={0} color="gray.700" fontVariantNumeric="tabular-nums">
      {label}
    </Text>
    {children}
  </Flex>
);

/**
 * その日の人数と過不足の一覧。スマートフォンの日別表示で、上端のカードとして使う。
 * 時間指定は「ポジション → 時間 → 人数」、パターン選択と日付選択は区切りごとの行にする。
 * 畳んだ状態では不足だけを出し、「すべて見る」で全部を出す。
 */
export const StaffingSummary = ({ date, defaultExpanded = false }: { date: string; defaultExpanded?: boolean }) => {
  const view = useDayStaffingView(date);
  const [isExpanded, setExpanded] = useState(defaultExpanded);
  if (!view) return null;

  const visibleSlots = isExpanded ? view.slots : view.slots.filter((slot) => slot.hasShortage);
  const visibleBands = view.bands
    .map((band) => ({
      ...band,
      segments: isExpanded ? band.segments : band.segments.filter((segment) => segment.tone === "shortage"),
    }))
    .filter((band) => band.segments.length > 0);
  const totalRowCount = view.slots.length + view.bands.reduce((sum, band) => sum + band.segments.length, 0);
  const visibleRowCount = visibleSlots.length + visibleBands.reduce((sum, band) => sum + band.segments.length, 0);
  // 不足だけを出している間に、隠れている行があるか。すべて不足の日は切り替えを出さない。
  const hasHiddenRows = totalRowCount > view.shortageCount;
  // ポジションが1つだけの店舗では、ポジション名の見出しを出さない。
  const showsPositionHeading = view.bands.length > 1;

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
            <Text color="red.700" fontWeight={700} flexShrink={0}>
              不足 {view.shortageCount}か所
            </Text>
          ) : view.hasRequirements ? (
            <Text color="gray.600" flexShrink={0}>
              不足なし
            </Text>
          ) : (
            <StaffingUnsetNote />
          )}
        </Flex>
        <Flex align="center" gap={1} flexShrink={0} minW={0}>
          <DayTemplateMenu date={date} view={view} />
          {hasHiddenRows && (
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
      {visibleRowCount > 0 && (
        <Box mt={2}>
          {visibleSlots.length > 0 && (
            <Box as="ul" listStyleType="none">
              {visibleSlots.map((slot) => (
                <SummaryRow key={slot.id} label={slot.label}>
                  <StaffingPositionCounts slot={slot} showNames />
                </SummaryRow>
              ))}
            </Box>
          )}
          {visibleBands.map((band) => (
            <Box key={band.positionId} mt={showsPositionHeading ? 1 : 0}>
              {showsPositionHeading && (
                <Flex align="center" gap="6px" fontWeight={700} color="gray.800" py="2px">
                  <Box
                    boxSize="8px"
                    borderRadius="full"
                    flexShrink={0}
                    style={{ background: band.color }}
                    aria-hidden
                  />
                  {band.name}
                </Flex>
              )}
              <Box as="ul" listStyleType="none" aria-label={`${band.name}の人数`}>
                {band.segments.map((segment) => (
                  <SummaryRow key={segment.key} label={segment.timeLabel}>
                    <StaffingCountChip view={segment} />
                  </SummaryRow>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
