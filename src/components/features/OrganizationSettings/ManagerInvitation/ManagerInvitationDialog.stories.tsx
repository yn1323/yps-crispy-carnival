import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManagerInvitationDialog } from "./ManagerInvitationDialog";

const meta = {
  title: "Features/OrganizationSettings/ManagerInvitationDialog",
  component: ManagerInvitationDialog,
  parameters: { layout: "fullscreen" },
  args: {
    isOpen: true,
    managerInvitationMode: "addition",
    freeManagerExchangeCandidates: [],
    peopleCapacityResolution: null,
    isRunning: false,
    onClose: () => undefined,
    onSubmit: () => undefined,
  },
} satisfies Meta<typeof ManagerInvitationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Addition: Story = {};

export const FreeManagerExchange: Story = {
  args: {
    managerInvitationMode: "freeManagerExchange",
    freeManagerExchangeCandidates: [
      { id: "person-staff", name: "鈴木 次郎", email: "suzuki@sakura.example.com" },
      { id: "person-staff-2", name: "山田 美咲", email: "yamada@sakura.example.com" },
    ],
  },
};

export const MobileFreeManagerExchange: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: FreeManagerExchange.args,
};
