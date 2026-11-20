import { Box, Icon, Kbd, Menu, Portal, Stack } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { type RefObject, useEffect, useRef } from "react";
import { LuCheck, LuClock, LuCoffee, LuTrash2 } from "react-icons/lu";
import type { MinuteRange } from "@/src/domains/shift/breaks";
import type { ShiftData } from "@/src/domains/shift/types";
import {
  assignShiftRangeAtom,
  breakEditorTargetAtom,
  deleteShiftPositionAtom,
  shiftConfigAtom,
  usesPositionColorsAtom,
} from "../../stores";
import { buildRangeAssignMenuViewModel, RANGE_BREAK_VALUE, toRangeAssignment } from "./script";

type RangeAssignMenuProps = {
  shift: ShiftData;
  /** 勤務のバーの上で選んだ範囲（分）。 */
  range: MinuteRange;
  /** 選んだ範囲を示す面。メニューを、この面のすぐ上に出す。 */
  anchorRef: RefObject<HTMLDivElement | null>;
  /**
   * メニューを収める範囲。表のスクロールする入れ物を渡す。
   * 上に入りきらない場合は面の下に出し、画面のヘッダーの後ろに隠れないようにする。
   */
  boundaryRef: RefObject<HTMLElement | null>;
  /** 何も変えずに閉じる。選んだあとも呼ぶ。 */
  onClose: () => void;
};

const EDIT_BREAKS_VALUE = "edit-breaks";
const DELETE_VALUE = "delete";
const itemStyle = { cursor: "pointer", ps: 8, pe: 3, py: 2 } as const;

/**
 * 勤務のバーの上で選んだ範囲に、ポジションまたは休憩を入れるメニュー。シンプル表示とくわしく表示で、同じメニューを使う。
 * ポジションを塗り分けない表示では、ポジションの代わりに「勤務」を出す。
 * 勤務の削除と、時刻を指定して休憩を足し引きする編集を開く項目もここに置く。
 */
export const RangeAssignMenu = ({ shift, range, anchorRef, boundaryRef, onClose }: RangeAssignMenuProps) => {
  const { positions } = useAtomValue(shiftConfigAtom);
  const assignShiftRange = useSetAtom(assignShiftRangeAtom);
  const deleteShiftPosition = useSetAtom(deleteShiftPositionAtom);
  const setBreakEditorTarget = useSetAtom(breakEditorTargetAtom);
  const contentRef = useRef<HTMLDivElement>(null);
  const showsPositions = useAtomValue(usesPositionColorsAtom);
  const viewModel = buildRangeAssignMenuViewModel({ shift, range, positions, showsPositions });

  const assign = (value: string) => {
    assignShiftRange({
      shiftId: shift.id,
      range,
      // チェックの出ている「休憩」をもう一度選んだ場合は、その休憩を外す。
      assignment:
        value === RANGE_BREAK_VALUE && viewModel.checkedValue === RANGE_BREAK_VALUE
          ? { kind: "removeBreak" }
          : toRangeAssignment(value),
      segmentId: `segment-${Date.now()}`,
    });
    onClose();
  };

  // チェックの出ている項目をもう一度選んだ場合も受け取れるよう、項目の選択はメニュー全体で受ける。
  const handleSelect = (value: string) => {
    if (value === EDIT_BREAKS_VALUE) {
      setBreakEditorTarget({ staffId: shift.staffId, date: shift.date });
      return;
    }
    if (value === DELETE_VALUE) {
      deleteShiftPosition({ shiftId: shift.id, positionIds: viewModel.deleteTarget?.segmentIds ?? [] });
      return;
    }
    assign(value);
  };

  // キーとスクロールの監視は開いている間に1回だけ登録し、最新の表示内容と操作を参照する。
  const latestRef = useRef({ viewModel, assign, onClose });
  latestRef.current = { viewModel, assign, onClose };

  useEffect(() => {
    // 1〜9のキーで、表示順のポジションを選ぶ。
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const choice = latestRef.current.viewModel.positions.find((position) => position.shortcut === event.key);
      if (!choice) return;
      event.preventDefault();
      latestRef.current.assign(choice.value);
    };
    // 表がスクロールすると選んだ範囲から離れるため閉じる。メニューの中のスクロールでは閉じない。
    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && contentRef.current?.contains(event.target)) return;
      latestRef.current.onClose();
    };
    window.addEventListener("keydown", handleKeydown, true);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("keydown", handleKeydown, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  return (
    <Menu.Root
      open
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      onSelect={(details) => handleSelect(details.value)}
      // 数字のキーをポジションの選択に使うため、文字での項目の検索は止める。
      typeahead={false}
      positioning={{
        placement: "top",
        gutter: 8,
        getAnchorRect: () => anchorRef.current?.getBoundingClientRect() ?? null,
        // 画面の上端ではなく表の上端を境にして、上に入りきらなければ下へ出す。
        boundary: () => boundaryRef.current ?? "clippingAncestors",
      }}
    >
      <Portal>
        <Menu.Positioner>
          <Menu.Content
            ref={contentRef}
            aria-label={`${viewModel.timeLabel}の${showsPositions ? "ポジション" : "勤務"}と休憩`}
            w="min(240px, calc(100vw - 24px))"
          >
            <Menu.RadioItemGroup value={viewModel.checkedValue ?? ""}>
              <Menu.ItemGroupLabel textStyle="xs" color="gray.600" fontVariantNumeric="tabular-nums">
                {viewModel.timeLabel}
              </Menu.ItemGroupLabel>
              {viewModel.positions.map((position) => (
                <Menu.RadioItem key={position.value} value={position.value} {...itemStyle}>
                  <Menu.ItemIndicator color="teal.600">
                    <LuCheck aria-hidden />
                  </Menu.ItemIndicator>
                  {position.color && (
                    <Box
                      boxSize="10px"
                      borderRadius="full"
                      flexShrink={0}
                      style={{ background: position.color }}
                      aria-hidden
                    />
                  )}
                  <Menu.ItemText fontSize="sm" fontWeight="medium" truncate>
                    {position.name}
                  </Menu.ItemText>
                  {position.shortcut && (
                    <Menu.ItemCommand aria-hidden>
                      <Kbd size="sm">{position.shortcut}</Kbd>
                    </Menu.ItemCommand>
                  )}
                </Menu.RadioItem>
              ))}
              <Menu.RadioItem value={RANGE_BREAK_VALUE} disabled={viewModel.isBreakDisabled} {...itemStyle}>
                <Menu.ItemIndicator color="teal.600">
                  <LuCheck aria-hidden />
                </Menu.ItemIndicator>
                <Icon boxSize={3.5} color="gray.600" aria-hidden>
                  <LuCoffee />
                </Icon>
                <Stack gap={0.5} minW={0}>
                  <Menu.ItemText fontSize="sm" fontWeight="medium">
                    休憩
                  </Menu.ItemText>
                  {viewModel.isBreakDisabled && (
                    <Box fontSize="xs" color="fg.muted" whiteSpace="normal">
                      まるごと休憩にはできません
                    </Box>
                  )}
                </Stack>
              </Menu.RadioItem>
            </Menu.RadioItemGroup>
            <Menu.Separator />
            <Menu.Item value={EDIT_BREAKS_VALUE} {...itemStyle} ps={3}>
              <Icon boxSize={3.5} color="gray.600" aria-hidden>
                <LuClock />
              </Icon>
              <Menu.ItemText fontSize="sm">{viewModel.breakEditorLabel}</Menu.ItemText>
            </Menu.Item>
            {viewModel.deleteTarget && (
              <Menu.Item value={DELETE_VALUE} color="red.600" {...itemStyle} ps={3}>
                <Icon boxSize={3.5} aria-hidden>
                  <LuTrash2 />
                </Icon>
                <Menu.ItemText fontSize="sm">削除</Menu.ItemText>
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};
