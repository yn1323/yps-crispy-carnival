import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
  args: {
    ...Form.args,
    isSubmitted: true,
  },
};

export const Expired: Story = {
  args: {
    data: {
      status: "expired",
      documents,
    },
    onSubmit: () => {},
  },
};

export const InteractiveDoubleSubmitGuard: Story = {
  parameters: { screenshot: { skip: true } },
  args: Form.args,
  render: () => <GuardedConfirmStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.dblClick(canvas.getByRole("button", { name: "申請する" }));

    await waitFor(() => expect(canvas.getByTestId("registration-submit-count")).toHaveTextContent("1"));
  },
};

function GuardedConfirmStory() {
  const [submitCount, setSubmitCount] = useState(0);
  const { run: handleSubmit, isRunning: isSubmitting } = useSingleFlight(async () => {
    setSubmitCount((count) => count + 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  return (
    <>
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
      <output data-testid="registration-submit-count" hidden>
        {submitCount}
      </output>
    </>
  );
}
