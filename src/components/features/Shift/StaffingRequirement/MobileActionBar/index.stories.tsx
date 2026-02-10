import type { Meta, StoryObj } from "@storybook/react-vite";
import { MobileActionBar } from "./index";

const meta = {
  title: "features/Shift/StaffingRequirement/MobileActionBar",
  component: MobileActionBar,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof MobileActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const spViewport = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const Basic: Story = {
  args: {
    onSave: () => {},
    hasChanges: false,
    isSaving: false,
  },
  ...spViewport,
};

export const WithChanges: Story = {
  args: {
    onSave: () => {},
    hasChanges: true,
    isSaving: false,
  },
  ...spViewport,
};

export const Saving: Story = {
  args: {
    onSave: () => {},
    hasChanges: true,
    isSaving: true,
  },
  ...spViewport,
};
