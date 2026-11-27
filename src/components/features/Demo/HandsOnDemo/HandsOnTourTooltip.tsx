import { Box, Flex, Text } from "@chakra-ui/react";
import { createContext, useContext } from "react";
import type { TooltipRenderProps } from "react-joyride";
import { Button } from "@/src/components/ui/Button";
import type { HandsOnTourStepData } from "./tourSteps";

/** 「次へ」を押したときの処理。読むだけの手順を終えたことにする。 */
export const HandsOnTourNextContext = createContext<(() => void) | null>(null);

/**
 * 体験デモの吹き出し。見た目は共通の吹き出しと同じにする。
 * 操作で進む手順にはボタンを置かず、読むだけの手順にだけ「次へ」を置く。
 */
export const HandsOnTourTooltip = ({ index, size, step, tooltipProps }: TooltipRenderProps) => {
  const onNext = useContext(HandsOnTourNextContext);
  const showsNext = (step.data as HandsOnTourStepData | undefined)?.showsNext === true && onNext !== null;
  return (
    <Box
      {...tooltipProps}
      bg="white"
      borderRadius="xl"
      boxShadow="lg"
      pt={5}
      pb={4}
      px={5}
      minW="280px"
      maxW="340px"
      position="relative"
      fontFamily="inherit"
    >
      {step.title && (
        <Text textStyle="md" fontWeight={700} color="gray.900" lineHeight="1.45">
          {step.title}
        </Text>
      )}
      {step.content && (
        <Text mt={1.5} textStyle="bodySm" color="gray.600" lineHeight="1.75" whiteSpace="pre-line">
          {step.content}
        </Text>
      )}
      <Flex mt={3} align="center" justify="space-between" gap={3}>
        <Text textStyle="caption" fontWeight={600} color="gray.400" fontVariantNumeric="tabular-nums">
          {index + 1} / {size}
        </Text>
        {showsNext && (
          <Button size="sm" colorPalette="teal" onClick={onNext}>
            次へ
          </Button>
        )}
      </Flex>
    </Box>
  );
};
