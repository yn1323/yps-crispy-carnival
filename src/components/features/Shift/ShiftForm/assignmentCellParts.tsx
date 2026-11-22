import { Box, chakra, Flex, type HTMLChakraProps, Icon, Text } from "@chakra-ui/react";
import { forwardRef, useId } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { Tooltip } from "@/src/components/ui/tooltip";
import { NewcomerOnlyMark } from "./staffingParts";
import type { PositionStaffingCountPresentation } from "./staffingPresentation";

// パターン選択の日別の表と、日付選択の表（PCの週の表、スマートフォンの1日ずつのリスト）が共通に使う部品。
// セルは、希望を示す点線の輪と、その内側に置く割り当てのピルの2つの層で描く。

/** セル1つ分の表示内容。パターン選択は「人×勤務パターン」、日付選択は「人×日」の1マスにあたる。 */
export type AssignmentPillCell = {
  /** 希望の輪を出すか。 */
  showsRequestRing: boolean;
  assigned: boolean;
  /** ピルの中身。ポジションを塗り分ける表示ではポジション名、それ以外は「○」。割り当てがなければnull。 */
  pillLabel: string | null;
  /** 入っている勤務のポジション。割り当てがなければnull。 */
  positionId: string | null;
  /** ピルを塗るポジションの色。ポジションを塗り分けない表示と、割り当てのないセルではnull。 */
  positionColor: string | null;
  dot: "orange" | null;
  /** 点の理由。点がなければ空。 */
  noticeTexts: string[];
  /** ボタンの名前。E2Eがこの名前で探すため、形を変えない。 */
  ariaLabel: string;
  /** 名前に添える説明。希望の有無、点の理由など。なければnull。 */
  ariaDescription: string | null;
};

const PILL_SIZES = {
  // パターン選択のPCの表。
  pc: { h: "36px", maxW: "152px", textStyle: "sm", px: 2 },
  // パターン選択のスマートフォンの表。勤務パターンが4つの店舗でも「キッチン」が入るよう、左右の余白を詰める。
  sp: { h: "34px", maxW: "96px", textStyle: "xs", px: 1 },
  // 日付選択のPCの週の表。行の高さ40pxに収める。
  week: { h: "32px", maxW: "96px", textStyle: "xs", px: 1 },
  // 日付選択のスマートフォンのリスト。ピルは幅52px以上、高さ28px。押せる範囲は上下に広げて44pxにする。
  list: { h: "37px", maxW: "96px", textStyle: "sm", px: 2 },
} as const;

// 見た目の高さが44pxに届かないピルは、押せる範囲だけを広げる。
const LIST_TAP_AREA = { content: '""', position: "absolute", insetX: 0, insetY: "-4px" } as const;

// シンプル表示と、ポジションを塗り分けない表示の、割り当てのピルの色。
const PLAIN_PILL_STYLE = { bg: "teal.100", color: "teal.800" } as const;
const DOT_COLORS = { orange: "orange.400" } as const;

type PillProps = Omit<HTMLChakraProps<"button">, "children"> & {
  cell: AssignmentPillCell;
  size: keyof typeof PILL_SIZES;
  /** 押して割り当てを変えられるか。閲覧専用ではfalseにする。 */
  isInteractive: boolean;
  /** 点にマウスを乗せたときに、理由を出すか。PCで使う。 */
  showsNoticeTooltip?: boolean;
};

/**
 * 割り当て1つ分のセル。
 * 輪の位置と大きさは、希望と割り当ての有無で変えない。希望のないセルでも、透明な輪の分の余白を取る。
 * 希望も割り当てもないセルは、押せるときだけ薄い灰色で塗る。
 */
export const AssignmentPill = forwardRef<HTMLButtonElement, PillProps>(
  ({ cell, size, isInteractive, showsNoticeTooltip = false, ...rest }, ref) => {
    const descriptionId = useId();
    const sizeStyle = PILL_SIZES[size];
    const isEmptyInteractive = isInteractive && !cell.assigned && !cell.showsRequestRing;
    const dot = cell.dot && (
      <Flex
        as="span"
        position="absolute"
        top="-5px"
        right="2px"
        boxSize="16px"
        align="center"
        justify="center"
        aria-hidden
      >
        <Box
          as="span"
          boxSize="8px"
          borderRadius="full"
          bg={DOT_COLORS[cell.dot]}
          boxShadow="0 0 0 1.5px white"
          data-assignment-dot={cell.dot}
        />
      </Flex>
    );
    return (
      <chakra.button
        ref={ref}
        type="button"
        aria-label={cell.ariaLabel}
        aria-describedby={cell.ariaDescription ? descriptionId : undefined}
        aria-disabled={!isInteractive}
        position="relative"
        display="flex"
        alignItems="center"
        justifyContent="center"
        w="full"
        maxW={sizeStyle.maxW}
        h={sizeStyle.h}
        p="3px"
        borderRadius="full"
        borderWidth="1.5px"
        borderStyle="dashed"
        borderColor={cell.showsRequestRing ? "gray.400" : "transparent"}
        // 希望も割り当てもない、押せるセルは、薄い灰色で押せる場所だと示す。
        bg={isEmptyInteractive ? "gray.100" : "transparent"}
        cursor={isInteractive ? "pointer" : "default"}
        transitionProperty="colors"
        transitionDuration="faster"
        _after={size === "list" ? LIST_TAP_AREA : undefined}
        _hover={isInteractive && !cell.assigned ? { bg: isEmptyInteractive ? "gray.200" : "gray.100" } : undefined}
        _active={
          isInteractive ? { bg: isEmptyInteractive ? "gray.300" : "gray.200", transitionDuration: "0ms" } : undefined
        }
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" }}
        {...rest}
      >
        {cell.assigned ? (
          <Flex
            as="span"
            w="full"
            h="full"
            minW={0}
            px={sizeStyle.px}
            align="center"
            justify="center"
            borderRadius="full"
            textStyle={sizeStyle.textStyle}
            fontWeight={600}
            lineHeight={1}
            {...(cell.positionColor ? undefined : PLAIN_PILL_STYLE)}
            style={
              cell.positionColor
                ? {
                    // ポジションの色を白で薄めた地に、同じ色を濃くした文字を載せる。
                    background: `color-mix(in srgb, ${cell.positionColor} 20%, white)`,
                    color: `color-mix(in srgb, ${cell.positionColor} 45%, black)`,
                  }
                : undefined
            }
          >
            <chakra.span truncate>{cell.pillLabel}</chakra.span>
          </Flex>
        ) : (
          cell.showsRequestRing && (
            <Text as="span" textStyle="xs" fontWeight={500} color="gray.500">
              希望あり
            </Text>
          )
        )}
        {dot &&
          (showsNoticeTooltip ? (
            <Tooltip
              content={cell.noticeTexts.map((text) => <Box key={text}>{text}</Box>)}
              openDelay={100}
              positioning={{ placement: "top" }}
            >
              {dot}
            </Tooltip>
          ) : (
            dot
          ))}
        {cell.ariaDescription && (
          <chakra.span id={descriptionId} srOnly>
            {cell.ariaDescription}
          </chakra.span>
        )}
      </chakra.button>
    );
  },
);
AssignmentPill.displayName = "AssignmentPill";

/** たたんだ人のまとまりの見出し。「休み希望 4人」「希望なし 2人」「この日の希望がない人 9人」。押すと、その人たちの行を開閉する。 */
export const FoldedStaffGroupToggle = ({
  group,
  isOpen,
  onToggle,
}: {
  group: { label: string; namesLabel: string };
  isOpen: boolean;
  onToggle: () => void;
}) => (
  <chakra.button
    type="button"
    aria-expanded={isOpen}
    onClick={onToggle}
    display="flex"
    alignItems="center"
    gap={2}
    w="full"
    minH="44px"
    px={{ base: 3, lg: 4 }}
    textAlign="left"
    cursor="pointer"
    color="gray.700"
    transitionProperty="colors"
    transitionDuration="faster"
    _hover={{ bg: "gray.50" }}
    _active={{ bg: "gray.100", transitionDuration: "0ms" }}
    _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
  >
    <Icon boxSize={4} color="gray.500" flexShrink={0} aria-hidden>
      {isOpen ? <LuChevronDown /> : <LuChevronRight />}
    </Icon>
    <Text as="span" textStyle="sm" fontWeight={600} flexShrink={0}>
      {group.label}
    </Text>
    {!isOpen && (
      <Text as="span" textStyle="xs" color="gray.500" truncate>
        {group.namesLabel}
      </Text>
    )}
  </chakra.button>
);

const COUNT_TONE_STYLES = {
  // 足りないポジションだけ、赤いチップで目立たせる。
  shortage: { bg: "#F7C1C1", color: "#791F1F" },
  even: { bg: "transparent", color: "gray.600" },
  excess: { bg: "transparent", color: "purple.600" },
  unset: { bg: "transparent", color: "gray.600" },
} as const;

/**
 * ポジション1つ分の「配置/必要」。チップと文字で同じ幅を取り、状態が変わっても位置を動かさない。
 * 文字を持たない（必要人数がなく、だれも入っていない）場合も、同じ幅の空きを残す。
 */
export const PositionStaffingCount = ({
  count,
  showsDot = true,
  showsName = false,
}: {
  count: PositionStaffingCountPresentation;
  /** 色の丸を出すか。ポジションを塗り分けない表示と、行の見出しにポジション名がある表では出さない。 */
  showsDot?: boolean;
  /** ポジション名を文字で出すか。凡例のないスマートフォンの充足の行で使う。出さない場合も読み上げには含める。 */
  showsName?: boolean;
}) => (
  <Flex
    as="span"
    align="center"
    gap={1}
    flexShrink={0}
    title={count.label === null ? undefined : count.description}
    visibility={count.label === null ? "hidden" : undefined}
    aria-hidden={count.label === null ? true : undefined}
  >
    {showsDot && (
      <Box boxSize="8px" borderRadius="full" flexShrink={0} style={{ background: count.color }} aria-hidden />
    )}
    {showsName ? (
      <Text as="span" textStyle="xs" color="gray.700" whiteSpace="nowrap">
        {count.positionName}
      </Text>
    ) : (
      <chakra.span srOnly>{count.positionName}</chakra.span>
    )}
    <Box
      as="span"
      minW="34px"
      px="6px"
      py="1px"
      borderRadius="full"
      textAlign="center"
      textStyle="xs"
      fontWeight={600}
      fontVariantNumeric="tabular-nums"
      {...COUNT_TONE_STYLES[count.tone]}
    >
      {count.label}
    </Box>
    {count.isNewcomerOnly && <NewcomerOnlyMark />}
  </Flex>
);

/** 「充足 56%」。100%未満は赤、100%は緑にする。 */
export const FulfillmentLabel = ({ percent, isFulfilled }: { percent: number; isFulfilled: boolean }) => (
  <Text
    as="span"
    textStyle="sm"
    fontWeight={700}
    color={isFulfilled ? "green.600" : "red.600"}
    fontVariantNumeric="tabular-nums"
    whiteSpace="nowrap"
  >
    充足 {percent}%
  </Text>
);

/** 押せないポジションの凡例。色の丸と名前を並べる。 */
export const PositionDotLegend = ({
  positions,
}: {
  positions: ReadonlyArray<{ id: string; name: string; color: string }>;
}) => (
  <Flex
    as="ul"
    aria-label="ポジション"
    listStyleType="none"
    align="center"
    columnGap={3}
    rowGap={1}
    flexWrap="wrap"
    minW={0}
  >
    {positions.map((position) => (
      <Flex as="li" key={position.id} align="center" gap="6px" minW={0}>
        <Box boxSize="10px" borderRadius="full" flexShrink={0} style={{ background: position.color }} aria-hidden />
        <Text as="span" textStyle="xs" fontWeight={600} color="gray.700" truncate>
          {position.name}
        </Text>
      </Flex>
    ))}
  </Flex>
);

/** 点の意味。ピルを押しても理由を出せない表示（スマートフォンで、押すと割り当てが外れる表示と閲覧専用）で、表の下に出す。 */
export const AssignmentDotLegend = () => (
  <Flex px={3} py={3} columnGap={4} rowGap={1} flexWrap="wrap" textStyle="2xs" color="gray.600">
    <Flex align="center" gap="6px">
      <Box boxSize="8px" borderRadius="full" bg="orange.400" aria-hidden />
      橙の点：確認が必要
    </Flex>
  </Flex>
);
