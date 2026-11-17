import { Box, chakra, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { type KeyboardEvent, useId, useState } from "react";
import { LuTrash2, LuX } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Input, NativeSelect } from "@/src/components/ui/FormControls";
import { getStaffingCountRange, type StaffingSegment } from "@/src/domains/shift/staffingSegments";
import { minutesToTime, type ShiftTimeOption, timeToMinutes } from "@/src/domains/shift/time";
import { keepRangeOrder, parseCountInput, type StaffingCountBandPosition } from "./script";

// 押して選べる人数のボタンの数。これより多い人数は、入力欄で入れる。
const COUNT_BUTTON_MAX = 5;

export type CountFormProps = {
  position: StaffingCountBandPosition;
  /** 人数を入れる範囲（分） */
  range: { startMinutes: number; endMinutes: number };
  segments: readonly StaffingSegment[];
  /** 受付時間の中で選べる時刻 */
  timeOptions: readonly ShiftTimeOption[];
  /** 刻み（分）。範囲の最小の長さでもある。 */
  unitMinutes: number;
  /** 選べる人数の上限 */
  maxCount: number;
  /** 指で押す大きさ（44px）にするか。falseは、吹き出しに収まる36pxにする。 */
  isTouchSize: boolean;
  /** 閉じる操作の出し方。吹き出しは見出しの右のアイコン、その場に出す欄は下のボタンにする。 */
  closeStyle: "icon" | "button";
  /**
   * 開始か終了を選び直したとき。
   * 人数の入った区間を編集している場合は、使う側がすぐその区間の時間を変える。新しく選んだ範囲では、範囲だけを変える。
   */
  onRangeChange: (range: { startMinutes: number; endMinutes: number }) => void;
  /** 人数を決めたとき。0は範囲の人数を消す。使う側が人数を入れて、欄を閉じる。 */
  onSelectCount: (count: number) => void;
  onClose: () => void;
};

/**
 * 選んだ範囲の必要人数を選ぶ欄の中身。吹き出しと、その場に出す欄で同じものを使う。
 * 人数のボタンは、1回押すとその人数が入る。ボタンより多い人数は、入力欄に数字を入れてEnterで入る。
 * 開始と終了は選び直せる。終了を開始以前に、または開始を終了以降にすると、もう片方が刻み1つ分ずれ、長さ0の範囲を作らない。
 * ゴミ箱のボタンは、範囲の人数を消す。
 */
export const CountForm = ({
  position,
  range,
  segments,
  timeOptions,
  unitMinutes,
  maxCount,
  isTouchSize,
  closeStyle,
  onRangeChange,
  onSelectCount,
  onClose,
}: CountFormProps) => {
  const timeLabelId = useId();
  const countLabelId = useId();
  const current = getStaffingCountRange({ segments, positionId: position.id, ...range });
  // 範囲の中の人数が1つにそろっているときだけ、その人数を選択済みにする。
  const selectedCount = current && current.min === current.max ? current.max : null;
  const hasCount = current !== null && current.max > 0;
  const controlHeight = isTouchSize ? "44px" : "36px";
  const buttonCount = Math.min(COUNT_BUTTON_MAX, maxCount);

  const changeRange = (next: { startMinutes: number; endMinutes: number }, changed: "start" | "end") =>
    onRangeChange(keepRangeOrder({ ...next, changed, unitMinutes }));

  return (
    <Stack gap={3}>
      <Flex align="center" justify="space-between" gap={2}>
        <Flex align="center" gap={2} minW={0}>
          <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
          <Text textStyle="sm" fontWeight={700} color="gray.900" truncate>
            {position.name}の必要人数
          </Text>
        </Flex>
        <HStack gap={1} flexShrink={0}>
          <IconButton
            type="button"
            size={isTouchSize ? "md" : "xs"}
            variant="ghost"
            colorPalette="red"
            aria-label="必要人数を削除"
            disabled={!hasCount}
            onClick={() => onSelectCount(0)}
          >
            <LuTrash2 />
          </IconButton>
          {closeStyle === "icon" && (
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              colorPalette="gray"
              aria-label="閉じる"
              onClick={onClose}
            >
              <LuX />
            </IconButton>
          )}
        </HStack>
      </Flex>
      <Stack gap={1.5} role="group" aria-labelledby={timeLabelId}>
        <Text id={timeLabelId} textStyle="sm" fontWeight={500} color="gray.900">
          時間帯
        </Text>
        <HStack gap={2}>
          <NativeSelect.Root size="sm" flex={1} minW={0}>
            <NativeSelect.Field
              aria-label="開始"
              value={minutesToTime(range.startMinutes)}
              bg="white"
              minH={controlHeight}
              fontVariantNumeric="tabular-nums"
              onChange={(event) =>
                changeRange({ startMinutes: timeToMinutes(event.target.value), endMinutes: range.endMinutes }, "start")
              }
            >
              {/* 最小の長さが残るよう、受付時間の終わりだけを除く。 */}
              {timeOptions.slice(0, -1).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Text fontSize="sm" color="fg.muted" aria-hidden>
            〜
          </Text>
          <NativeSelect.Root size="sm" flex={1} minW={0}>
            <NativeSelect.Field
              aria-label="終了"
              value={minutesToTime(range.endMinutes)}
              bg="white"
              minH={controlHeight}
              fontVariantNumeric="tabular-nums"
              onChange={(event) =>
                changeRange({ startMinutes: range.startMinutes, endMinutes: timeToMinutes(event.target.value) }, "end")
              }
            >
              {timeOptions.slice(1).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </HStack>
      </Stack>
      <Stack gap={1.5}>
        <Text id={countLabelId} textStyle="sm" fontWeight={500} color="gray.900">
          必要人数
        </Text>
        <CountInput
          // 範囲を選び直して人数が変わったら、入力中の数字を捨てて、いまの人数から始め直す。
          key={selectedCount ?? "mixed"}
          labelId={countLabelId}
          buttonCount={buttonCount}
          selectedCount={selectedCount}
          maxCount={maxCount}
          controlHeight={controlHeight}
          isTouchSize={isTouchSize}
          onSelectCount={onSelectCount}
        />
      </Stack>
      {closeStyle === "button" && (
        <Flex justify="flex-end">
          <Button type="button" variant="outline" bg="white" size="sm" minH={controlHeight} onClick={onClose}>
            閉じる
          </Button>
        </Flex>
      )}
    </Stack>
  );
};

type CountInputProps = {
  labelId: string;
  buttonCount: number;
  selectedCount: number | null;
  maxCount: number;
  controlHeight: string;
  isTouchSize: boolean;
  onSelectCount: (count: number) => void;
};

/** 人数のボタンと、ボタンより多い人数を数字で入れる欄。 */
const CountInput = ({
  labelId,
  buttonCount,
  selectedCount,
  maxCount,
  controlHeight,
  isTouchSize,
  onSelectCount,
}: CountInputProps) => {
  const errorId = useId();
  // ボタンにない人数が入っている範囲では、その人数を入力欄に出しておく。
  const isInputCount = selectedCount !== null && selectedCount > buttonCount;
  const [draft, setDraft] = useState(isInputCount ? String(selectedCount) : "");
  const [hasError, setHasError] = useState(false);

  // 外側のフォームを送らないよう、Enterはここで止める。変換中のEnterは、確定の操作として扱わない。
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const count = parseCountInput(draft, maxCount);
    if (count === null) {
      setHasError(true);
      return;
    }
    onSelectCount(count);
  };

  return (
    <Stack gap={1.5}>
      <Flex role="group" aria-labelledby={labelId} align="center" gap={isTouchSize ? 2 : 1.5}>
        {Array.from({ length: buttonCount }, (_, index) => {
          const count = index + 1;
          const isSelected = count === selectedCount;
          return (
            <chakra.button
              key={count}
              type="button"
              aria-label={`${count}人`}
              aria-pressed={isSelected}
              data-current-count={isSelected || undefined}
              onClick={() => onSelectCount(count)}
              boxSize={controlHeight}
              flexShrink={0}
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              borderWidth="1px"
              borderRadius="md"
              cursor="pointer"
              textStyle="sm"
              fontWeight={700}
              fontVariantNumeric="tabular-nums"
              // 選択済みは、濃いtealの地に白い文字で示す。押せる面とhoverは中立の色にする。
              bg={isSelected ? "teal.600" : "white"}
              color={isSelected ? "white" : "gray.900"}
              borderColor={isSelected ? "teal.600" : "gray.300"}
              _hover={{ bg: isSelected ? "teal.700" : "gray.100" }}
              _active={{ bg: isSelected ? "teal.800" : "gray.200" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" }}
            >
              {count}
            </chakra.button>
          );
        })}
        <Input
          aria-label="人数を数字で入力"
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          data-current-count={isInputCount || undefined}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setHasError(false);
          }}
          onKeyDown={handleKeyDown}
          inputMode="numeric"
          enterKeyHint="done"
          placeholder={`${buttonCount + 1}〜`}
          size="sm"
          flex={1}
          minW="56px"
          h={controlHeight}
          bg="white"
          textAlign="center"
          fontWeight={700}
          fontVariantNumeric="tabular-nums"
        />
      </Flex>
      {hasError && (
        <Text id={errorId} role="alert" textStyle="xs" color="red.600">
          1〜{maxCount}の数字を入れてください
        </Text>
      )}
    </Stack>
  );
};
