import type { Meta, StoryObj } from "@storybook/react-vite";
import { createStore, Provider } from "jotai";
import { userAtom } from "@/src/stores/user";
import { UserMenu } from "./index";

const createStoreWithUser = (name: string, email: string) => {
  const store = createStore();
  store.set(userAtom, { authId: "test", name, email });
  return store;
};

const meta = {
  title: "Templates/Header/UserMenu",
  component: UserMenu,
  parameters: {
    layout: "centered",
    backgrounds: { default: "teal", values: [{ name: "teal", value: "#0d9488" }] },
  },
  decorators: [
    (Story) => (
      <Provider store={createStoreWithUser("田中太郎", "tanaka@example.com")}>
        <Story />
      </Provider>
    ),
  ],
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** デフォルト表示 */
export const Default: Story = {};
