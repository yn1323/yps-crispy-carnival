import { Box, chakra, Flex, Grid, Heading, Image, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuRotateCcw } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { HANDS_ON_KEYFRAMES, HANDS_ON_ROOT_ATTRIBUTE } from "./motion";
import { StepCircle, type StepState } from "./StepCircle";
import { HANDS_ON_TOUR_Z_INDEX } from "./tourSteps";

const CHAPTERS = [
  { no: 1, label: "希望シフトを集める" },
  { no: 2, label: "シフトを作る" },
  { no: 3, label: "確定シフトを送る" },
] as const;

type ChapterNo = 1 | 2 | 3 | 4;
/** 上の段で押せる手順の番号。 */
export type HandsOnChapterTarget = (typeof CHAPTERS)[number]["no"];

type StepperProps = {
  current: ChapterNo;
  onSelect: (chapter: HandsOnChapterTarget) => void;
};

/**
 * 上の段の手順。終えた手順はチェック、いまの手順はtealで示す。スマートフォンでは、いまの手順の名前だけを出す。
 * 手順を押すと、その手順の始めへ移る。
 */
const ChapterStepper = ({ current, onSelect }: StepperProps) => {
  const stateOf = (no: number): StepState => (no < current ? "done" : no === current ? "current" : "upcoming");
  return (
    <Flex as="ol" align="center" gap={{ base: 1.5, lg: 3 }} aria-label="進み具合" listStyleType="none">
      {CHAPTERS.map((chapter, index) => (
        <Flex as="li" key={chapter.no} align="center" gap={{ base: 1.5, lg: 3 }}>
          {index > 0 && (
            <Box
              w={{ base: 4, lg: 8 }}
              h="2px"
              borderRadius="full"
              bg={chapter.no <= current ? "green.500" : "gray.200"}
              aria-hidden
            />
          )}
          <chakra.button
            type="button"
            // スマートフォンでは、いまの手順のほかは名前を隠すため、名前をラベルにも持たせる。
            aria-label={chapter.label}
            aria-current={chapter.no === current ? "step" : undefined}
            onClick={() => onSelect(chapter.no)}
            display="flex"
            alignItems="center"
            gap={2}
            // 押せる範囲を丸と名前の外まで広げ、並びは変えない。
            p={{ base: 2.5, lg: 2 }}
            m={{ base: -2.5, lg: -2 }}
            borderRadius="full"
            cursor="pointer"
            transitionProperty="background-color"
            transitionDuration="faster"
            _hover={{ bg: "gray.100" }}
            _focusVisible={{ outlineWidth: "2px", outlineStyle: "solid", outlineColor: "teal.500", outlineOffset: "0" }}
          >
            <StepCircle no={chapter.no} state={stateOf(chapter.no)} />
            <Text
              fontSize="sm"
              fontWeight={chapter.no === current ? "bold" : "medium"}
              color={chapter.no === current ? "gray.900" : "gray.500"}
              whiteSpace="nowrap"
              display={{ base: chapter.no === current ? "block" : "none", lg: "block" }}
            >
              {chapter.label}
            </Text>
          </chakra.button>
        </Flex>
      ))}
    </Flex>
  );
};

type Props = {
  chapter: ChapterNo;
  onReset: () => void;
  onSelectChapter: (chapter: HandsOnChapterTarget) => void;
  children: ReactNode;
};

/**
 * 見出しの行の重なり順。シフト表の吹き出しの暗くした面より上に置き、案内の間も暗くせず、
 * 上の段の手順と「最初からやり直す」を押せるようにする。
 */
const HEADER_Z_INDEX = HANDS_ON_TOUR_Z_INDEX + 10;

/** 体験デモの枠。見出しの行に、題、手順、「最初からやり直す」を置く。 */
export const HandsOnShell = ({ chapter, onReset, onSelectChapter, children }: Props) => (
  <Flex direction="column" h="100dvh" bg="white" overflow="hidden" {...{ [HANDS_ON_ROOT_ATTRIBUTE]: "" }}>
    <style>{HANDS_ON_KEYFRAMES}</style>
    <Box
      as="header"
      position="relative"
      zIndex={HEADER_Z_INDEX}
      borderBottomWidth="1px"
      borderColor="gray.200"
      bg="white"
      flexShrink={0}
    >
      <Grid
        templateColumns={{ base: "minmax(0, 1fr) auto", lg: "minmax(0, 1fr) auto minmax(0, 1fr)" }}
        alignItems="center"
        px={{ base: 4, lg: 6 }}
        py={{ base: 2.5, lg: 3 }}
        gap={{ base: 2, lg: 6 }}
      >
        <Flex align="center" gap={3} minW={0}>
          <Image src="/logo192.webp" alt="シフトリ" boxSize={8} flexShrink={0} />
          <Heading as="h1" fontSize={{ base: "md", lg: "lg" }} fontWeight="black" color="gray.900" whiteSpace="nowrap">
            シフトを作ってみよう！
          </Heading>
        </Flex>
        <Box display={{ base: "none", lg: "block" }}>
          <ChapterStepper current={chapter} onSelect={onSelectChapter} />
        </Box>
        <Flex justify="flex-end">
          <Button
            size="sm"
            variant="outline"
            colorPalette="gray"
            bg="white"
            display={{ base: "none", lg: "inline-flex" }}
            onClick={onReset}
          >
            <LuRotateCcw aria-hidden />
            最初からやり直す
          </Button>
          <IconButton
            aria-label="最初からやり直す"
            size="sm"
            variant="outline"
            colorPalette="gray"
            bg="white"
            display={{ base: "inline-flex", lg: "none" }}
            onClick={onReset}
          >
            <LuRotateCcw />
          </IconButton>
        </Flex>
      </Grid>
      <Box display={{ base: "block", lg: "none" }} px={4} pb={2.5}>
        <ChapterStepper current={chapter} onSelect={onSelectChapter} />
      </Box>
    </Box>
    <Box as="main" flex={1} minH={0} position="relative">
      {children}
    </Box>
  </Flex>
);
