import { Flex } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { AppOrganizationSwitcher, type AppOrganizationSwitcherOption } from ".";

const ORGANIZATION_A = "organizations_a" as Id<"organizations">;
const ORGANIZATION_B = "organizations_b" as Id<"organizations">;

const options: AppOrganizationSwitcherOption[] = [
  { id: ORGANIZATION_A, name: "株式会社さくらダイニング", memberStatus: "active" },
  {
    id: ORGANIZATION_B,
    name: "株式会社とても長い名前のみどりフーズ西日本事業本部",
    memberStatus: "readOnly",
  },
];

const meta = {
  title: "Features/AuthenticatedApp/AppOrganizationSwitcher",
  component: AppOrganizationSwitcher,
  args: {
    activeOrganizationId: ORGANIZATION_A,
    activeOrganizationName: options[0].name,
    options,
    onSelect: () => {},
  },
  decorators: [
    (Story) => (
      <Flex minH="68px" align="center" justify="flex-end" px={{ base: 4, md: 6 }} bg="white">
        <Story />
      </Flex>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppOrganizationSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const OpenMenuWithLongNameAndReadOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "組織を切り替える（現在：株式会社さくらダイニング）" }));

    const option = await screen.findByRole("menuitemradio", {
      name: "株式会社とても長い名前のみどりフーズ西日本事業本部 閲覧のみ",
    });
    await waitFor(() => expect(option).toBeVisible());
  },
};

export const SelectionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <SelectionBehaviorHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "組織を切り替える（現在：株式会社さくらダイニング）" }));
    await userEvent.click(
      await screen.findByRole("menuitemradio", {
        name: "株式会社とても長い名前のみどりフーズ西日本事業本部 閲覧のみ",
      }),
    );

    await expect(
      canvas.getByRole("button", {
        name: "組織を切り替える（現在：株式会社とても長い名前のみどりフーズ西日本事業本部）",
      }),
    ).toBeVisible();
  },
};

export const CurrentOrganizationIsNoOp: Story = {
  args: { onSelect: fn() },
  parameters: { screenshot: { skip: true } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const screen = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "組織を切り替える（現在：株式会社さくらダイニング）" }));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "株式会社さくらダイニング" }));

    await expect(args.onSelect).not.toHaveBeenCalled();
  },
};

export const OrganizationsLoading: Story = {
  args: { options: null },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("button", { name: /組織を切り替える/ })).not.toBeInTheDocument();
  },
};

export const SingleOrganization: Story = {
  args: { options: options.slice(0, 1) },
  parameters: { screenshot: { skip: true } },
  play: OrganizationsLoading.play,
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
};

export const NarrowMobileOpenMenu: Story = {
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: OpenMenuWithLongNameAndReadOnly.play,
};

function SelectionBehaviorHarness() {
  const [activeOrganizationId, setActiveOrganizationId] = useState(ORGANIZATION_A);
  const activeOrganization = options.find((option) => option.id === activeOrganizationId) ?? options[0];

  return (
    <AppOrganizationSwitcher
      activeOrganizationId={activeOrganization.id}
      activeOrganizationName={activeOrganization.name}
      options={options}
      onSelect={setActiveOrganizationId}
    />
  );
}
