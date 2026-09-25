import { Box } from "@chakra-ui/react";
import { splitJapaneseSentences } from "@/src/lib/japaneseSentences";

/** 1文ずつ改行して表示する。スマホで単語の途中から次の行へ送られるのを防ぐ。 */
export function SentenceLines({ text }: { text: string }) {
  return splitJapaneseSentences(text).map((sentence) => (
    <Box key={sentence} as="span" display="block">
      {sentence}
    </Box>
  ));
}

/** 文節ごとにinline-blockで並べ、文節の途中で折り返さないようにする。 */
export function PhraseLines({ phrases }: { phrases: string[] }) {
  return phrases.map((phrase) => (
    <Box key={phrase} as="span" display="inline-block">
      {phrase}
    </Box>
  ));
}
