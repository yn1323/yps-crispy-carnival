import type { Meta, StoryObj } from "@storybook/react-vite";
import { queryByRole } from "@testing-library/dom";
import { createStore, Provider } from "jotai";
import { expect, userEvent, within } from "storybook/test";
import { UserMenu } from "@/src/components/features/UserMenu";
import { Button } from "@/src/components/ui/Button";
import { userAtom } from "@/src/stores/user";
import { Header, type HeaderProps } from "./index";

const createStoreWithUser = (
  featureVisibility = {
    organizationSettingsNavigation: true,
    billing: true,
    shopMembershipAddition: true,
  },
) => {
  const store = createStore();
  store.set(userAtom, {
    authId: "test",
    name: "田中太郎",
    email: "tanaka@example.com",
    featureVisibility,
  });
  return store;
};

const meta = {
  title: "templates/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Provider store={createStoreWithUser()}>
        <Story />
      </Provider>
    ),
  ],
} satisfies Meta<HeaderProps>;

export default meta;
type Story = StoryObj<HeaderProps>;

export const User: Story = {
  args: {
    userActions: <UserMenu tone="light" />,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "ダッシュボードへ" })).toHaveAttribute("href", "/dashboard");
  },
};

export const UserWithoutShopDeletionEntry: Story = {
  args: {
    userActions: <UserMenu tone="light" />,
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async () => {
    const screen = within(document.body);
    const trigger = await screen.findByRole("button", { name: "ユーザーメニュー" });
    await userEvent.click(trigger);

    const contactLink = await screen.findByRole("menuitem", { name: "お問い合わせ" });
    await expect(contactLink).toHaveAttribute("href", "/contact");
    await expect(contactLink).toHaveAttribute("target", "_blank");
    await expect(screen.queryByRole("menuitem", { name: "組織設定" })).toBeNull();
    await expect(screen.getByRole("menuitem", { name: "アカウント設定" })).toHaveAttribute("href", "/account");
    await screen.findByRole("menuitem", { name: "ログアウト" });
    await expect(screen.queryByText("login@example.com")).toBeNull();
    await expect(screen.queryByText("tanaka@example.com")).toBeNull();
    await expect(screen.queryByRole("menuitem", { name: "店舗削除" })).toBeNull();
    await userEvent.keyboard("{Escape}");
  },
};

export const UserWithClosedFeatureState: Story = {
  args: {
    userActions: <UserMenu tone="light" />,
  },
  render: (args: HeaderProps) => (
    <Provider
      store={createStoreWithUser({
        organizationSettingsNavigation: false,
        billing: false,
        shopMembershipAddition: false,
      })}
    >
      <Header {...args} />
    </Provider>
  ),
  parameters: {
    screenshot: { skip: true },
  },
  play: async () => {
    const screen = within(document.body);
    const trigger = await screen.findByRole("button", { name: "ユーザーメニュー" });
    await userEvent.click(trigger);

    await expect(screen.queryByRole("menuitem", { name: "組織設定" })).toBeNull();
    await screen.findByRole("menuitem", { name: "お問い合わせ" });
    await screen.findByRole("menuitem", { name: "ログアウト" });
    await userEvent.keyboard("{Escape}");
  },
};

export const UserWithoutMenu: Story = {
  args: {},
};

export const UserWithAction: Story = {
  args: {
    userActions: (
      <>
        <Button size="sm">要望を送る</Button>
        <UserMenu tone="light" />
      </>
    ),
  },
};

export const MobileUserWithAction: Story = {
  tags: ["vrt-mobile2"],
  args: {
    userActions: (
      <>
        <Button size="sm">要望</Button>
        <UserMenu tone="light" />
      </>
    ),
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const Public: Story = {
  args: {
    variant: "public",
  },
};

export const PublicBrandOnly: Story = {
  args: {
    variant: "public",
    showLinks: false,
    showLogin: false,
  },
};

export const Staff: Story = {
  args: {
    variant: "staff",
    shopName: "居酒屋さくら",
    maxW: "1024px",
    px: { base: 4, lg: 6 },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(queryByRole(canvasElement, "link", { name: "シフトリのトップページへ" })).toBeNull();
  },
};

export const StaffWithAction: Story = {
  args: {
    variant: "staff",
    shopName: "居酒屋さくら",
    actions: <Button size="sm">要望を送る</Button>,
    maxW: "1024px",
    px: { base: 4, lg: 6 },
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  args: {
    variant: "public",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
