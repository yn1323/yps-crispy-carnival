import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { StaffSubmissionSection } from ".";

const meta = {
  title: "Features/LandingPage/StaffSubmissionSection",
  component: StaffSubmissionSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof StaffSubmissionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 活用例は提出方法のカードへ統合し、ヘッダーの「活用例」はこのsectionへ移動する。
    await expect(canvasElement.querySelector("section")).toHaveAttribute("id", "use-cases");
    for (const store of ["飲食店・カフェ", "小売店", "美容室・サロン", "イベント運営", "介護・施設"]) {
      await expect(canvas.getByText(store)).toBeInTheDocument();
    }
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
