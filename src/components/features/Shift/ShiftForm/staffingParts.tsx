import { Box, chakra, Flex, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { LuChartGantt, LuCheck, LuChevronDown, LuTriangleAlert } from "react-icons/lu";
import { NO_DAY_TEMPLATE } from "@/convex/shiftSetup/dayTemplates";
import { Button } from "@/src/components/ui/Button";
import { trackProductEvent } from "@/src/lib/webMeasurement";
import { useShiftFormDetailActions } from "./detailParts";
import { type DayStaffingView, NO_TEMPLATE_LABEL } from "./staffingPresentation";
import { canEditDayStaffingAtom, dayStaffingViewByDateAtom, shiftConfigAtom } from "./stores";

// その日の人数の取り出しと、その日のテンプレートのメニュー。くわしく表示のときだけ使う。

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

// ==========================================
// その日のテンプレートのメニュー
// ==========================================
const MENU_ITEM_PROPS = { cursor: "pointer", py: 2.5 } as const;

/** その日のテンプレートのメニューの項目。その日に当てるテンプレートか「テンプレートなし」を選ぶ。設定ページも開ける。 */
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
            <Menu.ItemGroupLabel>テンプレート</Menu.ItemGroupLabel>
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
            {/* その日にテンプレートを当てず、必要人数を持たない日にする。曜日や祝日のテンプレートより優先する。 */}
            <Menu.Item
              value="template:none"
              {...MENU_ITEM_PROPS}
              onClick={() => {
                if (!view.template.isNone) void editor.onApplyTemplate([date], NO_DAY_TEMPLATE);
              }}
            >
              <Box w={4} color="teal.600" flexShrink={0}>
                {view.template.isNone && <LuCheck aria-label="選択中" />}
              </Box>
              <Menu.ItemText fontSize="sm">{NO_TEMPLATE_LABEL}</Menu.ItemText>
            </Menu.Item>
          </Menu.ItemGroup>
          {onOpenSetup && <Menu.Separator />}
        </>
      )}
      {onOpenSetup && (
        <Menu.Item
          value="setup"
          {...MENU_ITEM_PROPS}
          onClick={() => {
            trackProductEvent({
              kind: "content_select",
              contentType: "shift_setup_link",
              contentId: "shift_board_menu",
            });
            onOpenSetup();
          }}
        >
          <Box w={4} flexShrink={0} />
          <Menu.ItemText fontSize="sm">必要人数設定を開く</Menu.ItemText>
        </Menu.Item>
      )}
    </>
  );
};

/**
 * その日のテンプレートの名前と、テンプレートを変えるメニュー。
 * 時間指定のPCは人数の帯の見出し、そのほかのスマートフォンとパターン選択のPCは日付の見出しに1つだけ置く。
 * 日付選択のPCの週の表は、日ごとの見出しに小さな名前を置き、同じ項目のメニューを開く。
 * 閲覧専用と確定済みでは、名前だけを出す。
 * `shrinks`を渡すと、置いた行の幅が足りないときに、名前を省略して縮む。
 * `fillsWidth`を渡すと、名前の長さに合わせず、置いた列の幅いっぱいに広げる。入りきらない名前は「…」で省略する。
 * `hidesIcon`を渡すと、時間帯の横棒のアイコンを出さない。幅の狭いスマートフォンの日付の見出しで、名前に幅を回すために使う。
 */
export const DayTemplateMenu = ({
  date,
  view,
  shrinks = false,
  fillsWidth = false,
  hidesIcon = false,
}: {
  date: string;
  view: DayStaffingView;
  shrinks?: boolean;
  fillsWidth?: boolean;
  hidesIcon?: boolean;
}) => {
  const editor = useDayStaffingEditor();
  const label = view.template.label;
  const sizeProps = {
    ...(shrinks || fillsWidth ? { flexShrink: 1, minW: 0 } : { flexShrink: 0 }),
    ...(fillsWidth ? { w: "full", maxW: "full" } : { maxW: "200px" }),
  };

  if (!editor) {
    return (
      <Text textStyle="xs" color="gray.600" truncate {...sizeProps}>
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
          // 列の幅いっぱいに広げたときは、名前を左、開く印を右の端に置く。
          justifyContent={fillsWidth ? "space-between" : undefined}
          {...sizeProps}
          aria-label={`この日のテンプレート: ${label}`}
        >
          {/* 時間帯の横棒のアイコンで、時間帯ごとの必要人数のテンプレートだと分かるようにする。名前が先に縮む。 */}
          <Flex as="span" align="center" gap={1} minW={0}>
            {!hidesIcon && (
              <Icon boxSize={3.5} flexShrink={0} color="gray.600" aria-hidden>
                <LuChartGantt />
              </Icon>
            )}
            <Box as="span" truncate>
              {label}
            </Box>
          </Flex>
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
