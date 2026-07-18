import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { OrganizationUserDetailDialog } from "./OrganizationUserDetailDialog";
import type { OrganizationPersonView } from "./types";

const person: OrganizationPersonView = {
  id: "person-manager",
  name: "田中 太郎",
  email: "tanaka@sakura.example.com",
  managerRole: "active",
  isStaff: true,
  isLineConnected: true,
  shopNames: ["渋谷店", "新宿店"],
  canRemoveManagerRole: true,
  canRemove: true,
};
const managerCandidate: OrganizationPersonView = {
  ...person,
  managerRole: "none",
  canRemoveManagerRole: false,
};

let managerAssignmentCallCount = 0;
const countManagerAssignment = async (): Promise<true> => {
  managerAssignmentCallCount += 1;
  return true;
};

const meta = {
  title: "Features/OrganizationSettings/OrganizationUserDetailDialog",
  component: OrganizationUserDetailDialog,
  parameters: { layout: "fullscreen" },
  args: {
    person,
    isOpen: true,
    canAssignManager: false,
    isManagerInvitationResend: false,
    managerAssignmentMode: "addition",
    isUpdatingProfile: false,
    isAssigningManager: false,
    onClose: () => undefined,
    onUpdateProfile: async () => true,
    onAssignManager: async () => true,
    onRemoveManagerRole: () => undefined,
    onRemovePerson: () => undefined,
  },
} satisfies Meta<typeof OrganizationUserDetailDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Information: Story = {};

export const Settings: Story = {
  args: { defaultTab: "settings" },
};

export const MobileInformation: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const MobileSettings: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: { defaultTab: "settings" },
};

export const FreeManagerExchangeConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    person: managerCandidate,
    defaultTab: "settings",
    canAssignManager: true,
    managerAssignmentMode: "freeManagerExchange",
    onAssignManager: countManagerAssignment,
  },
  play: async ({ canvasElement }) => {
    managerAssignmentCallCount = 0;
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "ユーザー詳細" });
    await userEvent.click(within(dialog).getByRole("button", { name: "管理者として招待" }));

    await expect(managerAssignmentCallCount).toBe(0);
    await expect(
      await within(dialog).findByRole("heading", { name: "田中 太郎さんへ管理者交代の案内を送りますか？" }),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "交代の案内を送る" }));
    await expect(managerAssignmentCallCount).toBe(1);
  },
};

export const FreeManagerExchangeResendConfirmationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    person: managerCandidate,
    defaultTab: "settings",
    canAssignManager: true,
    isManagerInvitationResend: true,
    managerAssignmentMode: "freeManagerExchange",
    onAssignManager: countManagerAssignment,
  },
  play: async ({ canvasElement }) => {
    managerAssignmentCallCount = 0;
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "ユーザー詳細" });
    await userEvent.click(within(dialog).getByRole("button", { name: "ログイン案内を再送" }));

    await expect(managerAssignmentCallCount).toBe(0);
    await expect(
      await within(dialog).findByRole("heading", { name: "田中 太郎さんへ管理者交代の案内を再送しますか？" }),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "交代の案内を再送" }));
    await expect(managerAssignmentCallCount).toBe(1);
  },
};
