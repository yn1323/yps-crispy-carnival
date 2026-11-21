import { Box, Icon, Kbd, Menu, Portal } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuTrash2 } from "react-icons/lu";
import type { PositionType } from "@/src/domains/shift/types";
import { AssignmentPill, type AssignmentPillCell } from "../assignmentCellParts";

const DELETE_VALUE = "__delete__";
const SHORTCUT_LIMIT = 9;
const itemStyle = { cursor: "pointer", py: 2.5 } as const;

type Props = {
  cell: AssignmentPillCell;
  /** ピルの大きさ。パターン選択の日別は`pc`、日付選択の週の表は`week`。 */
  size: "pc" | "week";
  positions: readonly PositionType[];
  onChangePosition: (positionId: string) => void;
  onRemove: () => void;
};

/**
 * 割り当て済みのピル。押すと、その場にポジションのメニューを開く。パターン選択と日付選択のPCの表が使う。
 * 開いている間は、数字キーの1〜9でもポジションを選べる。Escとメニューの外のクリックは、何も変えずに閉じる。
 */
export const PositionMenuCell = ({ cell, size, positions, onChangePosition, onRemove }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  const select = (positionId: string) => {
    // いまのポジションをもう一度選んだ場合は、何も変えずに閉じる。
    if (positionId !== cell.positionId) onChangePosition(positionId);
    setIsOpen(false);
  };
  // キーの監視は開いている間に1回だけ登録し、最新の操作を参照する。
  const latestRef = useRef({ positions, select });
  latestRef.current = { positions, select };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= SHORTCUT_LIMIT) return;
      const position = latestRef.current.positions[index];
      if (!position) return;
      event.preventDefault();
      latestRef.current.select(position.id);
    };
    window.addEventListener("keydown", handleKeydown, true);
    return () => window.removeEventListener("keydown", handleKeydown, true);
  }, [isOpen]);

  return (
    <Menu.Root
      open={isOpen}
      onOpenChange={(details) => setIsOpen(details.open)}
      onSelect={(details) => {
        if (details.value === DELETE_VALUE) onRemove();
      }}
      // 数字のキーをポジションの選択に使うため、文字での項目の検索は止める。
      typeahead={false}
      positioning={{ placement: "bottom", gutter: 6 }}
      lazyMount
      unmountOnExit
    >
      <Menu.Trigger asChild>
        <AssignmentPill cell={cell} size={size} isInteractive showsNoticeTooltip aria-haspopup="menu" />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(220px, calc(100vw - 24px))">
            <Menu.RadioItemGroup value={cell.positionId ?? ""} onValueChange={(details) => select(details.value)}>
              {positions.map((position, index) => (
                <Menu.RadioItem key={position.id} value={position.id} {...itemStyle}>
                  <Menu.ItemIndicator color="teal.600">
                    <LuCheck aria-hidden />
                  </Menu.ItemIndicator>
                  <Box
                    boxSize="10px"
                    borderRadius="full"
                    flexShrink={0}
                    style={{ background: position.color }}
                    aria-hidden
                  />
                  <Menu.ItemText fontSize="sm" fontWeight="medium" truncate>
                    {position.name}
                  </Menu.ItemText>
                  {index < SHORTCUT_LIMIT && (
                    <Menu.ItemCommand aria-hidden>
                      <Kbd size="sm">{index + 1}</Kbd>
                    </Menu.ItemCommand>
                  )}
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
            <Menu.Separator />
            <Menu.Item value={DELETE_VALUE} color="red.600" {...itemStyle} ps={3}>
              <Icon boxSize={3.5} aria-hidden>
                <LuTrash2 />
              </Icon>
              <Menu.ItemText fontSize="sm">削除</Menu.ItemText>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};
