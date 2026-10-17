import { Box, chakra, Icon, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuMessageSquare, LuMessageSquarePlus } from "react-icons/lu";

/** 日付の右に置くメモボタン。休みに戻す「×」と離し、行の切替操作と兄弟要素にする。 */
export function DateNoteButton({
  dateLabel,
  hasNote,
  onClick,
}: {
  dateLabel: string;
  hasNote: boolean;
  onClick: () => void;
}) {
  return (
    <chakra.button
      type="button"
      aria-label={hasNote ? `${dateLabel}のメモを編集` : `${dateLabel}のメモを書く`}
      onClick={onClick}
      position="relative"
      zIndex={1}
      flexShrink={0}
      w="28px"
      h="28px"
      ml={-1}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      borderRadius="md"
      color={hasNote ? "teal.700" : "gray.400"}
      cursor="pointer"
      transitionProperty="colors"
      transitionDuration="faster"
      _hover={{ bg: "blackAlpha.50", color: hasNote ? "teal.800" : "gray.600" }}
      _active={{ bg: "blackAlpha.100", transitionDuration: "0ms" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      <Icon boxSize={4}>{hasNote ? <LuMessageSquare /> : <LuMessageSquarePlus />}</Icon>
    </chakra.button>
  );
}

/** カードの2段目に置くメモ本文。押すとメモの編集を開く。閲覧専用ではテキストだけを表示する。 */
export function DateNoteLine({ dateLabel, note, onClick }: { dateLabel: string; note: string; onClick?: () => void }) {
  const content = (
    <>
      <Icon boxSize={3.5} mt="3px" color="teal.700" flexShrink={0}>
        <LuMessageSquare aria-hidden />
      </Icon>
      <Text as="span" fontSize="xs" lineHeight={1.6} color="gray.600" minW={0} overflowWrap="anywhere">
        <VisuallyHidden>{dateLabel}のメモ：</VisuallyHidden>
        <span data-clarity-mask="true">{note}</span>
      </Text>
    </>
  );
  const lineStyle = {
    position: "relative",
    zIndex: 1,
    display: "flex",
    w: "full",
    gap: 1.5,
    alignItems: "flex-start",
    px: 4,
    py: 1.5,
    borderTopWidth: "1px",
    borderTopStyle: "dashed",
    borderColor: "gray.300",
    textAlign: "left",
  } as const;

  if (!onClick) return <Box {...lineStyle}>{content}</Box>;
  return (
    <chakra.button
      type="button"
      onClick={onClick}
      {...lineStyle}
      cursor="pointer"
      _hover={{ bg: "blackAlpha.50" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
    >
      {content}
    </chakra.button>
  );
}

/**
 * 行全体を出勤・休みの切替にするための透明なボタン。
 * メモボタンを切替ボタンの中へ入れ子にしないよう、行の内容とは兄弟要素として重ねる。
 * 重ねる内容には`pointerEvents="none"`と`position="relative"`を付け、カードは`overflow="hidden"`で角を切る。
 */
export function DayToggleOverlay({
  ariaLabel,
  onClick,
  hoverBg,
  activeBg,
}: {
  ariaLabel: string;
  onClick: () => void;
  hoverBg: string;
  activeBg: string;
}) {
  return (
    <chakra.button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      position="absolute"
      inset={0}
      cursor="pointer"
      transitionProperty="background"
      transitionDuration="faster"
      _hover={{ bg: hoverBg }}
      _active={{ bg: activeBg, transitionDuration: "0ms" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
    />
  );
}
