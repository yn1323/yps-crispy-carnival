import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrganizationUserDetailDialog } from "./OrganizationUserDetailDialog";
import type { OrganizationPersonView } from "./types";

const person: OrganizationPersonView = {
  id: "person-manager",
  name: "田中 太郎",
  email: "tanaka@sakura.example.com",
  managerRole: "active",
  isStaff: true,
  shopNames: ["渋谷店", "新宿店"],
  canRemoveManagerRole: true,
  canRemove: true,
};

const meta = {
  title: "Features/OrganizationSettings/OrganizationUserDetailDialog",
  component: OrganizationUserDetailDialog,
  parameters: { layout: "fullscreen" },
  args: {
    person,
    isOpen: true,
    onClose: () => undefined,
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
