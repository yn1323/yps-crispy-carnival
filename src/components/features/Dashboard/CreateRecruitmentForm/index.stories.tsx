import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "@/src/components/ui/Dialog";
import { CreateRecruitmentForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/CreateRecruitmentForm",
  component: CreateRecruitmentForm,
  parameters: {
    layout: "padded",
  },
  args: {
    onSubmit: () => {},
  },
} satisfies Meta<typeof CreateRecruitmentForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InDialog: Story = {
  render: () => (
    <Dialog
      title="新しい募集をつくる"
      isOpen={true}
      onOpenChange={() => {}}
      formId="create-recruitment-form"
      submitLabel="募集をつくる"
      onClose={() => {}}
    >
      <CreateRecruitmentForm onSubmit={() => {}} />
    </Dialog>
  ),
};
