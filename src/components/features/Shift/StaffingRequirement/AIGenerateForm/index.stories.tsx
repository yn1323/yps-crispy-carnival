import type { Meta, StoryObj } from "@storybook/react-vite";
import { AIGenerateForm } from "./index";

const meta = {
  title: "features/Shift/StaffingRequirement/AIGenerateForm",
  component: AIGenerateForm,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof AIGenerateForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const positions = [
  { _id: "pos_1", name: "ホール" },
  { _id: "pos_2", name: "キッチン" },
  { _id: "pos_3", name: "その他" },
];

export const Basic: Story = {
  args: {
    openTime: "09:00",
    closeTime: "22:00",
    positions,
    onGenerate: (result, aiInput) => {
      console.log("Generated:", result, aiInput);
    },
    onSkip: () => {
      console.log("Skipped");
    },
  },
};

export const WithInitialInput: Story = {
  args: {
    openTime: "09:00",
    closeTime: "22:00",
    positions,
    initialAIInput: {
      shopType: "カフェ、ランチメインで夜は軽め",
      customerCount: "平日80人、土日120人くらい",
    },
    onGenerate: (result, aiInput) => {
      console.log("Generated:", result, aiInput);
    },
    onSkip: () => {
      console.log("Skipped");
    },
  },
};

export const Loading: Story = {
  args: {
    openTime: "09:00",
    closeTime: "22:00",
    positions,
    initialAIInput: {
      shopType: "カフェ",
      customerCount: "100人",
    },
    onGenerate: () => {},
    onSkip: () => {},
    isLoading: true,
  },
};

export const ShortHours: Story = {
  args: {
    openTime: "11:00",
    closeTime: "15:00",
    positions: [
      { _id: "pos_1", name: "ホール" },
      { _id: "pos_2", name: "キッチン" },
    ],
    onGenerate: (result, aiInput) => {
      console.log("Generated:", result, aiInput);
    },
    onSkip: () => {
      console.log("Skipped");
    },
  },
};
