import { Box, chakra, Icon, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuMessageSquare, LuPlus } from "react-icons/lu";

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
      aria-label={hasNote ? `${dateLabel}の連絡事項を編集` : `${dateLabel}の連絡事項を書く`}
      onClick={onClick}
      position="relative"
      zIndex={1}
      flexShrink={0}
      ml={1}
      h="28px"
      px={1.5}
      display="inline-flex"
      alignItems="center"
      gap={0.5}
      borderWidth="1px"
      borderColor="gray.300"
      borderRadius="md"
      bg="white"
      color={hasNote ? "teal.700" : "gray.600"}
      fontSize="xs"
      fontWeight="medium"
      whiteSpace="nowrap"
      cursor="pointer"
      transitionProperty="colors"
      transitionDuration="faster"
      // 見た目は小さく保ち、押せる範囲だけを高さ44pxまで広げる。
      _before={{ content: '""', position: "absolute", insetX: "-4px", insetY: "-8px" }}
      _hover={{ bg: "gray.50", borderColor: "gray.400", color: hasNote ? "teal.800" : "gray.800" }}
      _active={{ bg: "gray.100", transitionDuration: "0ms" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
    >
      <Icon boxSize={3.5} aria-hidden>
        {hasNote ? <LuMessageSquare /> : <LuPlus />}
      </Icon>
      {/* 幅360pxの時間指定行に収めるため、メモの有無は文言を変えずアイコンと色と下段の本文で示す。 */}
      メモ
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
        <VisuallyHidden>{dateLabel}の連絡事項：</VisuallyHidden>
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
