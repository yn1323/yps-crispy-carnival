import { Box, chakra, Icon, Text } from "@chakra-ui/react";
import { LuCheck, LuTrash2 } from "react-icons/lu";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PositionType } from "@/src/domains/shift/types";

type Props = {
  /** スタッフ名。 */
  title: string;
  /** タイトルの下に出す、勤務パターンと時間（パターン選択）、または日付（日付選択）。 */
  subtitle: string;
  /** 点の理由。「希望していない日です」など。なければ空。 */
  noticeTexts: readonly string[];
  /** 理由の文字の色を決める、点の色。 */
  dot: "red" | "orange" | null;
  positions: readonly PositionType[];
  currentPositionId: string | null;
  onChangePosition: (positionId: string) => void;
  onRemove: () => void;
  onClose: () => void;
};

/**
 * スマートフォンで、割り当て済みのピルを押して開く、画面中央のモーダル。ポジションを選ぶか、割り当てを削除する。
 * 選んだ時点で反映して閉じる。右上の×とモーダルの外は、何も変えずに閉じる。
 */
export const PositionDialog = ({
  title,
  subtitle,
  noticeTexts,
  dot,
  positions,
  currentPositionId,
  onChangePosition,
  onRemove,
  onClose,
}: Props) => (
  <Dialog
    title={title}
    isOpen
    onOpenChange={(details) => {
      if (!details.open) onClose();
    }}
    hideFooter
    maxW="sm"
  >
    <Text textStyle="sm" color="gray.600" fontVariantNumeric="tabular-nums">
      {subtitle}
    </Text>
    {noticeTexts.length > 0 && (
      <Box mt={2} textStyle="xs" color={dot === "red" ? "red.700" : "orange.700"}>
        {noticeTexts.map((text) => (
          <Text key={text}>{text}</Text>
        ))}
      </Box>
    )}
    <Box as="ul" role="radiogroup" aria-label="ポジション" listStyleType="none" mt={3}>
      {positions.map((position) => {
        const checked = position.id === currentPositionId;
        return (
          <Box as="li" key={position.id} borderBottomWidth="1px" borderColor="gray.100">
            <chakra.button
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => (checked ? onClose() : onChangePosition(position.id))}
              display="flex"
              alignItems="center"
              gap={3}
              w="full"
              minH="48px"
              textAlign="left"
              cursor="pointer"
              _active={{ bg: "gray.100", transitionDuration: "0ms" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
            >
              <Box
                boxSize="12px"
                borderRadius="full"
                flexShrink={0}
                style={{ background: position.color }}
                aria-hidden
              />
              <Text as="span" flex={1} minW={0} textStyle="md" color="gray.800" truncate>
                {position.name}
              </Text>
              {checked && (
                <Icon boxSize={4} color="teal.600" aria-hidden>
                  <LuCheck />
                </Icon>
              )}
            </chakra.button>
          </Box>
        );
      })}
    </Box>
    <chakra.button
      type="button"
      onClick={onRemove}
      display="flex"
      alignItems="center"
      gap={2}
      w="full"
      minH="48px"
      color="red.600"
      textStyle="md"
      cursor="pointer"
      _active={{ bg: "gray.100", transitionDuration: "0ms" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "red.500", outlineOffset: "-2px" }}
    >
      <Icon boxSize={4} aria-hidden>
        <LuTrash2 />
      </Icon>
      削除
    </chakra.button>
  </Dialog>
);
