import type { Meta, StoryObj } from "@storybook/react-vite";
import { getByRole } from "@testing-library/dom";
import { expect } from "storybook/test";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { StaffRegistrationPage } from "./index";

const documents = {
  terms: { title: "スタッフ向け利用規約", path: "/terms/staff" },
  privacy: { title: "スタッフ向けプライバシーポリシー", path: "/privacy/staff" },
};

const meta = {
  title: "Features/StaffRegistration",
  component: StaffRegistrationPage,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <StaffLayout shopName="居酒屋たなか">
        <Story />
      </StaffLayout>
    ),
  ],
} satisfies Meta<typeof StaffRegistrationPage>;

export default meta;
type Story = StoryObj<typeof meta>;
let doubleSubmitCount = 0;

export const Form: Story = {
  args: {
    data: {
      status: "ok",
      shopName: "居酒屋たなか",
      documents,
    },
    onSubmit: () => {},
  },
};

export const Confirm: Story = {
  parameters: { chromatic: { disableSnapshot: true } },
  args: {
    ...Form.args,
    initialConfirmData: {
      name: "田中 花子",
      email: "hanako@example.com",
      acceptedLegal: true,
    },
  },
};

export const Submitted: Story = {
  parameters: { chromatic: { disableSnapshot: true } },
  args: {
    ...Form.args,
    isSubmitted: true,
  },
};

export const Expired: Story = {
  parameters: { chromatic: { disableSnapshot: true } },
  args: {
    data: {
      status: "expired",
      documents,
    },
    onSubmit: () => {},
  },
};

export const InteractiveDoubleSubmitGuard: Story = {
  parameters: { chromatic: { disableSnapshot: true } },
  args: Form.args,
  render: () => <GuardedConfirmStory />,
  play: async ({ canvasElement }) => {
    doubleSubmitCount = 0;
    const submitButton = getByRole(canvasElement, "button", { name: "申請する" });
    submitButton.click();
    submitButton.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(doubleSubmitCount).toBe(1);
  },
};

function GuardedConfirmStory() {
  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(async () => {
    doubleSubmitCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  return (
    <StaffRegistrationPage
      data={{
        status: "ok",
        shopName: "居酒屋たなか",
        documents,
      }}
      isSubmitting={isSubmitting}
      initialConfirmData={{
        name: "田中 花子",
        email: "hanako@example.com",
        acceptedLegal: true,
      }}
      onSubmit={handleSubmit}
    />
  );
}
