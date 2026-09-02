import { Box, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LuArrowRight, LuSettings } from "react-icons/lu";
import { Button, IconButton } from ".";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

const variants = ["solid", "outline", "ghost", "plain", "subtle", "surface"] as const;
const pressedStateCases = [
  { label: "solid / teal", buttonProps: { variant: "solid", colorPalette: "teal" } },
  { label: "solid / red", buttonProps: { variant: "solid", colorPalette: "red" } },
  { label: "solid / gray", buttonProps: { variant: "solid", colorPalette: "gray" } },
  { label: "outline", buttonProps: { variant: "outline", colorPalette: "teal" } },
  { label: "ghost", buttonProps: { variant: "ghost", colorPalette: "teal" } },
  { label: "plain", buttonProps: { variant: "plain", colorPalette: "teal" } },
  { label: "subtle", buttonProps: { variant: "subtle", colorPalette: "teal" } },
  { label: "surface", buttonProps: { variant: "surface", colorPalette: "teal" } },
  {
    label: "selected / outline",
    buttonProps: {
      variant: "outline",
      colorPalette: "teal",
      bg: "teal.600",
      borderColor: "teal.600",
      color: "white",
    },
  },
  {
    label: "selected / custom",
    buttonProps: { variant: "solid", colorPalette: "gray", bg: "teal.600", color: "white" },
  },
] as const;
const backgrounds = [
  { label: "white", bg: "white" },
  { label: "gray.50", bg: "gray.50" },
  { label: "teal.50", bg: "teal.50" },
] as const;

export const Variants: Story = {
  render: () => (
    <Stack gap={8}>
      <Stack gap={2}>
        <Text fontSize="sm" fontWeight="bold">
          Variants
        </Text>
        <SimpleGrid columns={{ base: 1, lg: 3 }} gap={4}>
          {backgrounds.map((surface) => (
            <Surface key={surface.label} label={surface.label} bg={surface.bg}>
              {variants.map((variant) => (
                <HStack key={variant} justify="space-between" gap={4}>
                  <Text w="112px" fontSize="xs" color="fg.muted">
                    {variant}
                  </Text>
                  <Button variant={variant} colorPalette="teal" size="sm">
                    希望を見る
                    <LuArrowRight />
                  </Button>
                </HStack>
              ))}
            </Surface>
          ))}
        </SimpleGrid>
      </Stack>

      <Stack gap={2}>
        <Text fontSize="sm" fontWeight="bold">
          States
        </Text>
        <Surface label="button states" bg="teal.50">
          <HStack gap={3} wrap="wrap">
            <Button colorPalette="teal">保存する</Button>
            <Button colorPalette="teal" loading>
              保存する
            </Button>
            <Button colorPalette="teal" disabled>
              保存する
            </Button>
            <Button variant="outline" colorPalette="teal">
              戻る
            </Button>
            <Button variant="outline" colorPalette="teal" borderRadius="full">
              ログイン
            </Button>
            <IconButton aria-label="設定" variant="ghost" colorPalette="teal">
              <LuSettings />
            </IconButton>
          </HStack>
        </Surface>
      </Stack>
    </Stack>
  ),
};

export const PressedStates: Story = {
  tags: ["vrt-mobile2"],
  render: () => (
    <Stack gap={3} maxW="xl">
      <HStack ps="88px" gap={3}>
        <Text flex="1" fontSize="xs" fontWeight="semibold" color="fg.muted">
          通常
        </Text>
        <Text flex="1" fontSize="xs" fontWeight="semibold" color="fg.muted">
          押下中
        </Text>
      </HStack>
      {pressedStateCases.map(({ label, buttonProps }) => (
        <HStack key={label} gap={3} align="center">
          <Text w="76px" flexShrink="0" fontSize="xs" color="fg.muted">
            {label}
          </Text>
          <Button flex="1" size="sm" {...buttonProps}>
            希望を見る
          </Button>
          <Button flex="1" size="sm" data-active="" {...buttonProps}>
            希望を見る
          </Button>
        </HStack>
      ))}
    </Stack>
  ),
};

const Surface = ({ label, bg, children }: { label: string; bg: string; children: React.ReactNode }) => (
  <Box bg={bg} borderWidth="1px" borderColor="border.muted" borderRadius="lg" p={4}>
    <Stack gap={3}>
      <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
        {label}
      </Text>
      {children}
    </Stack>
  </Box>
);
