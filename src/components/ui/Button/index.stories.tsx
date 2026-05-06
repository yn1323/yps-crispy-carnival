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

const variants = ["solid", "outline", "ghost", "plain"] as const;
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
