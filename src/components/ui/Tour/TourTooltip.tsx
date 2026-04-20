import { Box, Flex, Text } from "@chakra-ui/react";
import type { TooltipRenderProps } from "react-joyride";

/**
 * react-joyride の tooltipComponent として渡す Chakra 製ツールチップ。
 * イベント駆動ツアー用途のため「戻る」「次へ」「×」は置かない
 * （進行はユーザーの自然操作で行い、終了はツアー完走か呼び出し側の制御に委ねる）。
 */
export const TourTooltip = ({ index, size, step, tooltipProps }: TooltipRenderProps) => (
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
      <Text fontSize="15px" fontWeight={700} color="gray.900" lineHeight="1.45">
        {step.title}
      </Text>
    )}

    {step.content && (
      <Text mt={1.5} fontSize="13px" color="gray.600" lineHeight="1.75">
        {step.content}
      </Text>
    )}

    <Flex mt={3} align="center" justify="flex-end">
      <Text fontSize="11px" fontWeight={600} color="gray.400" style={{ fontVariantNumeric: "tabular-nums" }}>
        {index + 1} / {size}
      </Text>
    </Flex>
  </Box>
);
