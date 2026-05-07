import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandingCatalogMock } from "./LandingCatalogMock";
import { LandingStoryMock } from "./LandingStoryMock";

const meta = {
  title: "Mock/LandingPage",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StoryBased: Story = {
  render: () => <LandingStoryMock />,
};

export const StoryBasedMobile: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  render: () => <LandingStoryMock />,
};

export const CatalogBased: Story = {
  render: () => <LandingCatalogMock />,
};

export const CatalogBasedMobile: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  render: () => <LandingCatalogMock />,
};
