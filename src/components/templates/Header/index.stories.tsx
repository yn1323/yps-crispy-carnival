import type { Meta, StoryObj } from "@storybook/react-vite";
import { createStore, Provider } from "jotai";
import { userAtom } from "@/src/stores/user";
import { Header, type HeaderProps } from "./index";

const createStoreWithUser = () => {
  const store = createStore();
  store.set(userAtom, { authId: "test", name: "田中太郎", email: "tanaka@example.com" });
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
  args: {},
};

export const UserWithoutMenu: Story = {
  args: {
    showUserMenu: false,
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
