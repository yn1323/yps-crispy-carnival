import type { Meta, StoryObj } from "@storybook/react-vite";
import { createStore, Provider } from "jotai";
import { expect, within } from "storybook/test";
import { userAtom } from "@/src/stores/user";
import { PeopleCapacityResolutionAlert } from "./index";

const createStoryStore = (billing: boolean) => {
  const store = createStore();
  store.set(userAtom, {
    authId: "storybook-user",
    name: "田中太郎",
    email: "tanaka@example.com",
    featureVisibility: {
      organizationSettingsNavigation: billing,
      billing,
      shopMembershipAddition: false,
    },
  });
  return store;
};

const meta = {
  title: "Shared/PeopleCapacityResolutionAlert",
  component: PeopleCapacityResolutionAlert,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Provider store={createStoryStore(true)}>
        <Story />
      </Provider>
    ),
  ],
} satisfies Meta<typeof PeopleCapacityResolutionAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChoosePro: Story = {
  args: {
    resolution: { kind: "choosePaidPlan", current: 5, max: 5 },
    retryActionLabel: "スタッフを追加",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "プランと支払いを確認" })).toHaveAttribute(
      "href",
      "/settings?tab=billing",
    );
  },
};

export const ContactForIndividualPlan: Story = {
  name: "Limit reached",
  args: {
    resolution: { kind: "limitReached", current: 50, max: 50 },
    retryActionLabel: "申請を承認",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("このプランでは、これ以上利用者を追加できません。", { exact: false })).toBeVisible();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
};

export const ChooseProWhileBillingHidden: Story = {
  args: {
    resolution: { kind: "choosePaidPlan", current: 5, max: 5 },
    retryActionLabel: "スタッフを追加",
  },
  render: (args) => (
    <Provider store={createStoryStore(false)}>
      <PeopleCapacityResolutionAlert {...args} />
    </Provider>
  ),
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link", { name: "プランと支払いを確認" })).toBeNull();
    await expect(canvas.getByRole("link", { name: "利用上限について問い合わせる" })).toHaveAttribute(
      "href",
      "/contact",
    );
  },
};
