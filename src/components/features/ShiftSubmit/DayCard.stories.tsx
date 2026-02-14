import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import { DayCard } from "./DayCard";

const meta = {
  title: "features/ShiftSubmit/DayCard",
  component: DayCard,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <Box maxW="400px" w="full">
        <Story />
      </Box>
    ),
  ],
  args: {
    onUpdate: fn(),
  },
} satisfies Meta<typeof DayCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockShop = { timeUnit: 30, openTime: "09:00", closeTime: "22:00" };

const mockFrequentTimePatterns = [
  { startTime: "09:00", endTime: "17:00", count: 5 },
  { startTime: "10:00", endTime: "18:00", count: 3 },
  { startTime: "13:00", endTime: "22:00", count: 2 },
];

export const Unselected: Story = {
  args: {
    entry: { date: "2026-03-03", isAvailable: false },
    frequentTimePatterns: mockFrequentTimePatterns,
    shop: mockShop,
  },
};

export const Selected: Story = {
  args: {
    entry: { date: "2026-03-04", isAvailable: true, startTime: "09:00", endTime: "17:00" },
    frequentTimePatterns: mockFrequentTimePatterns,
    shop: mockShop,
  },
};

export const Saturday: Story = {
  args: {
    entry: { date: "2026-03-07", isAvailable: true, startTime: "10:00", endTime: "18:00" },
    frequentTimePatterns: mockFrequentTimePatterns,
    shop: mockShop,
  },
};

export const Sunday: Story = {
  args: {
    entry: { date: "2026-03-08", isAvailable: true, startTime: "13:00", endTime: "22:00" },
    frequentTimePatterns: mockFrequentTimePatterns,
    shop: mockShop,
  },
};

export const NoPatterns: Story = {
  args: {
    entry: { date: "2026-03-02", isAvailable: true },
    frequentTimePatterns: [],
    shop: mockShop,
  },
};
