import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffRegistrationPage } from "./index";

const documents = {
  terms: { title: "スタッフ向け利用規約", path: "/terms/staff" },
  privacy: { title: "スタッフ向けプライバシーポリシー", path: "/privacy/staff" },
};

const meta = {
  title: "Features/StaffRegistration",
  component: StaffRegistrationPage,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <Box w="560px" maxW="100vw" bg="white">
        <Story />
      </Box>
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
