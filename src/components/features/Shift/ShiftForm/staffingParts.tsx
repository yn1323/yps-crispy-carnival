import { Box, chakra, Flex, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { type ReactNode, useState } from "react";
import { LuCheck, LuChevronDown, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { useShiftFormDetailActions } from "./detailParts";
import {
  type DayStaffingView,
  STAFFING_TONE_STYLES,
  type StaffingCountView,
  type StaffingSlotView,
} from "./staffingPresentation";
import { canEditDayStaffingAtom, dayStaffingViewByDateAtom, shiftConfigAtom } from "./stores";

// 人数と過不足、その日のテンプレートのメニュー。くわしく表示のときだけ出す。

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
/** 見習いだけの時間帯の印。確認事項と同じ、注意のアイコンで示す。意味は、押したときの欄とtitleで伝える。 */
export const NewcomerOnlyMark = () => (
  <Box as="span" display="inline-flex" alignItems="center" color="orange.600" flexShrink={0} title="見習いだけ">
    <Icon boxSize={3.5} aria-hidden>
      <LuTriangleAlert />
    </Icon>
    <chakra.span srOnly>見習いだけ</chakra.span>
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

// ==========================================
// その日のテンプレートのメニュー
// ==========================================
const MENU_ITEM_PROPS = { cursor: "pointer", py: 2.5 } as const;

/** その日のテンプレートのメニューの項目。その日に当てるテンプレートを選ぶ。設定ページも開ける。 */
export const DayTemplateMenuItems = ({ date, view }: { date: string; view: DayStaffingView }) => {
  const config = useAtomValue(shiftConfigAtom);
  const editor = useDayStaffingEditor();
  const { onOpenSetup } = useShiftFormDetailActions();
  const templates = config.staffing?.templates ?? [];
  if (!editor) return null;

  return (
    <>
      {templates.length > 0 && (
        <>
          <Menu.ItemGroup>
            <Menu.ItemGroupLabel>この日のテンプレート</Menu.ItemGroupLabel>
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
          {onOpenSetup && <Menu.Separator />}
        </>
      )}
      {onOpenSetup && (
        <Menu.Item value="setup" {...MENU_ITEM_PROPS} onClick={onOpenSetup}>
          <Box w={4} flexShrink={0} />
          <Menu.ItemText fontSize="sm">シフト作成の設定を開く</Menu.ItemText>
        </Menu.Item>
      )}
    </>
  );
};

/**
 * その日のテンプレートの名前と、テンプレートを変えるメニュー。
 * PCの日別表示と時間指定のスマートフォンは日付の見出し、パターン選択と日付選択のスマートフォンは人数のカードに1つだけ置く。
 * 閲覧専用と確定済みでは、名前だけを出す。
 * `shrinks`を渡すと、置いた行の幅が足りないときに、名前を省略して縮む。
 */
export const DayTemplateMenu = ({
  date,
  view,
  shrinks = false,
}: {
  date: string;
  view: DayStaffingView;
  shrinks?: boolean;
}) => {
  const editor = useDayStaffingEditor();
  const label = view.template.label;
  const sizeProps = shrinks ? { flexShrink: 1, minW: 0 } : { flexShrink: 0 };

  if (!editor) {
    return (
      <Text textStyle="xs" color="gray.600" truncate maxW="200px" {...sizeProps}>
        <chakra.span srOnly>この日のテンプレート: </chakra.span>
        {label}
      </Text>
    );
  }

  return (
    <Menu.Root positioning={{ placement: "bottom-start", gutter: 6 }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          size="xs"
          variant="outline"
          h="28px"
          px={2}
          gap={1}
          maxW="200px"
          {...sizeProps}
          aria-label={`この日のテンプレート: ${label}`}
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
// 人数のカード（パターン選択と日付選択）
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
 * その日の人数と過不足の一覧。パターン選択と日付選択のスマートフォンの日別表示で、上端のカードとして使う。
 * 勤務パターンごと、または1日の行にする。畳んだ状態では不足だけを出し、「すべて見る」で全部を出す。
 * 時間指定のスマートフォンは、このカードではなく充足の帯（FulfillmentSection）で示す。
 */
export const StaffingSummary = ({ date, defaultExpanded = false }: { date: string; defaultExpanded?: boolean }) => {
  const view = useDayStaffingView(date);
  const [isExpanded, setExpanded] = useState(defaultExpanded);
  if (!view) return null;

  const visibleSlots = isExpanded ? view.slots : view.slots.filter((slot) => slot.hasShortage);
  // 不足だけを出している間に、隠れている行があるか。すべて不足の日は切り替えを出さない。
  const hasHiddenRows = view.slots.length > view.shortageCount;

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
      {visibleSlots.length > 0 && (
        <Box as="ul" listStyleType="none" mt={2}>
          {visibleSlots.map((slot) => (
            <SummaryRow key={slot.id} label={slot.label}>
              <StaffingPositionCounts slot={slot} showNames />
            </SummaryRow>
          ))}
        </Box>
      )}
    </Box>
  );
};
