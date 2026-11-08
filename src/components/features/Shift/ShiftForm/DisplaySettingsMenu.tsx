import { Icon, Menu, Portal } from "@chakra-ui/react";
import { LuCheck, LuChevronDown, LuMessageSquare } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { useShiftDateNotesVisibility } from "./dateNotes";

/** 日付見出しの右端に置く、シフト表の見え方を切り替えるメニュー。 */
export function DisplaySettingsMenu() {
  const { isVisible, setVisible } = useShiftDateNotesVisibility();

  return (
    <Menu.Root positioning={{ placement: "bottom-end", gutter: 8 }}>
      <Menu.Trigger asChild>
        {/* 文字と高さはヘッダーの「PDF・Excel」ボタンにそろえる。 */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          h={{ base: "28px", lg: "32px" }}
          px={{ base: 2.5, lg: 3 }}
          position="relative"
          // 見た目は小さく保ち、押せる範囲だけを高さ44pxまで広げる。
          _after={{ content: '""', position: "absolute", insetX: 0, insetY: { base: "-8px", lg: "-6px" } }}
          gap={1}
          flexShrink={0}
          whiteSpace="nowrap"
        >
          表示設定
          <LuChevronDown aria-hidden />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(240px, calc(100vw - 24px))">
            <Menu.CheckboxItem
              value="staff-notes"
              checked={isVisible}
              onCheckedChange={setVisible}
              cursor="pointer"
              ps={8}
              pe={3}
              py={2.5}
            >
              <Menu.ItemIndicator color="teal.600">
                <LuCheck aria-hidden />
              </Menu.ItemIndicator>
              <Icon boxSize={4} color="gray.600" aria-hidden>
                <LuMessageSquare />
              </Icon>
              <Menu.ItemText fontSize="sm" fontWeight="medium">
                連絡事項を表示
              </Menu.ItemText>
            </Menu.CheckboxItem>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
