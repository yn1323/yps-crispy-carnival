import { Icon, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue } from "jotai";
import { useId } from "react";
import { LuCheck, LuChevronDown, LuMessageSquare } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { StaffSortMode } from "@/src/domains/shift/types";
import { useShiftDateNotesVisibility } from "./dateNotes";
import { useShiftFormDetailActions } from "./detailParts";
import { detailModeAtom, detailToggleEnabledAtom, shiftConfigAtom, staffSortModeAtom } from "./stores";

const DETAIL_MODE_OPTIONS = [
  { value: "simple", label: "シンプル", description: "勤務時間のみ表示" },
  { value: "detail", label: "くわしく", description: "時間、ポジション、過不足を表示" },
] as const;

const STAFF_SORT_MODE_OPTIONS: ReadonlyArray<{ value: StaffSortMode; label: string; description: string }> = [
  { value: "fixed", label: "固定", description: "スタッフページの並び順" },
  { value: "workTime", label: "勤務時間順", description: "勤務と希望の時間が早い順" },
];

/**
 * 日付見出しの右端に置く、シフト表の見え方を切り替えるメニュー。
 * 「シンプル / くわしく」は、PCとスマートフォンのどちらも、このメニューだけで切り替える。
 */
export function DisplaySettingsMenu({
  showsDateNotesToggle = true,
}: {
  /** 「連絡事項を表示」を出すか。連絡事項を名前の横のアイコンだけで示す画面（パターン選択の日別）では出さない。 */
  showsDateNotesToggle?: boolean;
} = {}) {
  const descriptionId = useId();
  const { isVisible, setVisible } = useShiftDateNotesVisibility();
  const [detailMode, setDetailMode] = useAtom(detailModeAtom);
  const showDetailToggle = useAtomValue(detailToggleEnabledAtom);
  const { requestDetailModeChange, requestStaffSortModeChange } = useShiftFormDetailActions();
  const staffSortMode = useAtomValue(staffSortModeAtom);
  const { submissionPattern } = useAtomValue(shiftConfigAtom);
  // 日付選択の勤務には時刻がなく、「勤務時間順」を選んでも並びが変わらないため、項目を出さない。
  const showStaffSortMode = Boolean(requestStaffSortModeChange) && submissionPattern.kind !== "dateOnly";
  const handleDetailModeSelect = (isDetailMode: boolean) => {
    if (isDetailMode === detailMode) return;
    // 切り替えを画面の外で受け付ける場合は、確認が済んで開き直されるまで、いまの表示のままにする。
    if (requestDetailModeChange) requestDetailModeChange(isDetailMode);
    else setDetailMode(isDetailMode);
  };

  // 出す項目が1つもない場合は、ボタンごと出さない。
  if (!showsDateNotesToggle && !showDetailToggle && !showStaffSortMode) return null;

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
            {showsDateNotesToggle && (
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
            )}
            {showDetailToggle && (
              <>
                {showsDateNotesToggle && <Menu.Separator />}
                <Menu.RadioItemGroup
                  value={detailMode ? "detail" : "simple"}
                  onValueChange={({ value }) => handleDetailModeSelect(value === "detail")}
                >
                  {DETAIL_MODE_OPTIONS.map((option) => (
                    <Menu.RadioItem
                      key={option.value}
                      value={option.value}
                      aria-label={option.label}
                      aria-describedby={`${descriptionId}-${option.value}`}
                      cursor="pointer"
                      ps={8}
                      pe={3}
                      py={2.5}
                    >
                      <Menu.ItemIndicator color="teal.600">
                        <LuCheck aria-hidden />
                      </Menu.ItemIndicator>
                      <Stack gap={0.5} minW={0}>
                        <Menu.ItemText fontSize="sm" fontWeight="semibold">
                          {option.label}
                        </Menu.ItemText>
                        <Text
                          id={`${descriptionId}-${option.value}`}
                          fontSize="xs"
                          color="fg.muted"
                          whiteSpace="normal"
                        >
                          {option.description}
                        </Text>
                      </Stack>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioItemGroup>
              </>
            )}
            {showStaffSortMode && (
              <>
                {(showsDateNotesToggle || showDetailToggle) && <Menu.Separator />}
                <Menu.RadioItemGroup
                  value={staffSortMode}
                  onValueChange={({ value }) => {
                    if (value !== staffSortMode) requestStaffSortModeChange?.(value as StaffSortMode);
                  }}
                >
                  <Menu.ItemGroupLabel textStyle="xs" color="fg.muted" fontWeight="semibold">
                    スタッフ並び替え
                  </Menu.ItemGroupLabel>
                  {STAFF_SORT_MODE_OPTIONS.map((option) => (
                    <Menu.RadioItem
                      key={option.value}
                      value={option.value}
                      aria-label={option.label}
                      aria-describedby={`${descriptionId}-sort-${option.value}`}
                      cursor="pointer"
                      ps={8}
                      pe={3}
                      py={2.5}
                    >
                      <Menu.ItemIndicator color="teal.600">
                        <LuCheck aria-hidden />
                      </Menu.ItemIndicator>
                      <Stack gap={0.5} minW={0}>
                        <Menu.ItemText fontSize="sm" fontWeight="semibold">
                          {option.label}
                        </Menu.ItemText>
                        <Text
                          id={`${descriptionId}-sort-${option.value}`}
                          fontSize="xs"
                          color="fg.muted"
                          whiteSpace="normal"
                        >
                          {option.description}
                        </Text>
                      </Stack>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioItemGroup>
              </>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
