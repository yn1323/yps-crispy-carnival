import { Flex, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReissueForm } from "./index";

const meta = {
  title: "Features/StaffView/ReissueForm",
  component: ReissueForm,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReissueForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const AllVariants = () => (
  <Flex direction="column" gap={4}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
      通常
    </Text>
    <ReissueForm onSubmit={() => {}} isSubmitting={false} />

    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mt={2}>
      送信中
    </Text>
    <ReissueForm onSubmit={() => {}} isSubmitting={true} />
  </Flex>
);

export const Variants: Story = {
  render: () => <AllVariants />,
  args: {
    onSubmit: () => {},
    isSubmitting: false,
  },
};
