import { Box, Button, Flex, Icon, IconButton, Text } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import type { TooltipRenderProps } from "react-joyride";

/**
 * react-joyride の tooltipComponent として渡す Chakra 製ツールチップ。
 * 色・角丸・影は Chakra のトークン（teal系ブランドカラー）に揃えている。
 */
export const TourTooltip = ({
  index,
  size,
  step,
  backProps,
  primaryProps,
  closeProps,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) => (
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
    <IconButton
      {...closeProps}
      aria-label="閉じる"
      variant="ghost"
      size="xs"
      color="gray.400"
      position="absolute"
      top={2.5}
      right={2.5}
      minW="24px"
      h="24px"
    >
      <Icon boxSize={3.5}>
        <LuX />
      </Icon>
    </IconButton>

    {step.title && (
      <Text fontSize="15px" fontWeight={700} color="gray.900" lineHeight="1.45" pr={6}>
        {step.title}
      </Text>
    )}

    {step.content && (
      <Text mt={1.5} fontSize="13px" color="gray.600" lineHeight="1.75">
        {step.content}
      </Text>
    )}

    <Flex mt={4} align="center" justify="space-between" gap={2}>
      <Text fontSize="11px" fontWeight={600} color="gray.400" style={{ fontVariantNumeric: "tabular-nums" }}>
        {index + 1} / {size}
      </Text>
      <Flex gap={2}>
        {index > 0 && (
          <Button {...backProps} variant="outline" size="xs" colorPalette="gray" h="30px" px={3.5} fontSize="12px">
            戻る
          </Button>
        )}
        <Button {...primaryProps} colorPalette="teal" size="xs" h="30px" px={3.5} fontSize="12px">
          {isLastStep ? "触ってみる" : "次へ"}
        </Button>
      </Flex>
    </Flex>
  </Box>
);
