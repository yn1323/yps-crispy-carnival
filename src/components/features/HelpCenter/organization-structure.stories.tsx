import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { HelpOrganizationStructure } from "./HelpOrganizationStructure";

const meta = {
  title: "Features/HelpCenter/OrganizationStructure",
  component: HelpOrganizationStructure,
  decorators: [
    (Story) => (
      <>
        <style>{`
          html[data-vrt="true"] header {
            position: static !important;
            inset-inline-start: auto !important;
            inset-inline-end: auto !important;
            top: auto !important;
          }

          html[data-vrt="true"] main {
            padding-top: 0 !important;
          }
        `}</style>
        <Story />
      </>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    vrt: { releaseFixedHeader: true },
  },
} satisfies Meta<typeof HelpOrganizationStructure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const relatedHelp = within(canvas.getByRole("region", { name: "関連情報" }));

    await expect(relatedHelp.getByRole("link", { name: /管理者を招待・再送・取り消す/ })).toHaveAttribute(
      "href",
      "/help/manage-manager-invitations",
    );
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
