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
      onClose={() => {}}
      hideFooter
      maxW={{ base: "100vw", md: "760px" }}
      maxH={{ base: "100dvh", md: "90dvh" }}
      contentProps={{
        h: { base: "100dvh", md: "auto" },
        borderRadius: { base: 0, md: "l3" },
        my: { base: 0, md: "var(--dialog-base-margin)" },
      }}
      bodyProps={{ p: 0, display: "flex", flexDirection: "column", overflowY: "hidden" }}
    >
      <CreateRecruitmentForm onSubmit={() => {}} onCancel={() => {}} />
    </Dialog>
  ),
};

export const MobileFullScreen: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: () => (
    <Dialog
      title="新しい募集をつくる"
      isOpen={true}
      onOpenChange={() => {}}
      onClose={() => {}}
      hideFooter
      maxW="100vw"
      maxH="100dvh"
      contentProps={{ h: "100dvh", borderRadius: 0, my: 0 }}
      bodyProps={{ p: 0, display: "flex", flexDirection: "column", overflowY: "hidden" }}
    >
      <CreateRecruitmentForm onSubmit={() => {}} onCancel={() => {}} />
    </Dialog>
  ),
};
