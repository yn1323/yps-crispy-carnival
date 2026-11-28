import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { createContext, useContext } from "react";
import { LuUserRound } from "react-icons/lu";
import type { TooltipRenderProps } from "react-joyride";
import { Button } from "@/src/components/ui/Button";
import type { HandsOnTourStepData } from "./tourSteps";

/** 「次へ」を押したときの処理。読むだけの手順（希望を確かめる、話）を終えたことにする。 */
export const HandsOnTourNextContext = createContext<(() => void) | null>(null);

/**
 * 体験デモの吹き出し。見た目は共通の吹き出しと同じにする。
 * 操作で進む手順にはボタンを置かず、読むだけの手順にだけ「次へ」を置く。
 */
export const HandsOnTourTooltip = ({ index, size, step, tooltipProps }: TooltipRenderProps) => {
  const onNext = useContext(HandsOnTourNextContext);
  const data = step.data as HandsOnTourStepData | undefined;
  const showsNext = data?.showsNext === true && onNext !== null;
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
      {data?.story ? (
        // 話の手順は、人のアイコンを添えて、話す言葉として見せる。
        <Flex align="flex-start" gap={3}>
          <Flex
            boxSize={9}
            borderRadius="full"
            bg="teal.50"
            color="teal.700"
            align="center"
            justify="center"
            flexShrink={0}
          >
            <Icon as={LuUserRound} boxSize={5} aria-hidden />
          </Flex>
          <Text textStyle="md" fontWeight={600} color="gray.900" lineHeight="1.6" pt={1}>
            {step.content}
          </Text>
        </Flex>
      ) : (
        <>
          {step.title && (
            <Text textStyle="md" fontWeight={700} color="gray.900" lineHeight="1.45">
              {step.title}
            </Text>
          )}
          {step.content &&
            (step.title ? (
              <Text mt={1.5} textStyle="bodySm" color="gray.600" lineHeight="1.75" whiteSpace="pre-line">
                {step.content}
              </Text>
            ) : (
              // 見出しのない手順は、ひとことの操作の案内なので、見出しと同じ強さで見せる。
              <Text textStyle="md" fontWeight={700} color="gray.900" lineHeight="1.45">
                {step.content}
              </Text>
            ))}
        </>
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
