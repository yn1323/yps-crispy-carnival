import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { faqEntries } from "@/src/components/features/FaqSite/faqContent";
import { FaqPage } from ".";

const meta = {
  title: "Pages/FaqPage",
  component: FaqPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FaqPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};

export const Search: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const searchbox = canvas.getByRole("searchbox", { name: "よくある質問を検索" });
    const structuredData = canvasElement.querySelector('script[type="application/ld+json"]');
    const faqPageJsonLd = JSON.parse(structuredData?.textContent ?? "") as { mainEntity: unknown[] };

    await expect(faqPageJsonLd.mainEntity).toHaveLength(faqEntries.length);

    await userEvent.type(searchbox, "LINE 届かない");

    await expect(canvas.getByText("2件の質問が見つかりました")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "管理者向け LINE通知が届かないときは、何を確認すればよいですか？" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", {
        level: 3,
        name: "管理者向け LINE通知が届かないときは、何を確認すればよいですか？",
      }),
    ).toBeInTheDocument();

    await userEvent.clear(searchbox);
    await userEvent.type(searchbox, "一致しない検索語");
    await userEvent.click(canvas.getByRole("button", { name: "検索をクリア" }));

    await expect(searchbox).toHaveFocus();
    await expect(searchbox).toHaveValue("");
  },
};

export const AnswerDetails: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const searchbox = canvas.getByRole("searchbox", { name: "よくある質問を検索" });

    await userEvent.type(searchbox, "LINEかメール 通知先 送り分け");
    await userEvent.click(
      canvas.getByRole("button", {
        name: "スタッフへのシフト通知はLINEとメールのどちらへ送られますか？",
      }),
    );

    const visual = await canvas.findByRole("img", {
      name: "LINEで受け取れる場合は通常LINEへ送り、利用できない場合やLINE送信の上限に達した場合はメールへ切り替える流れ",
    });
    await waitFor(() => expect(visual).toBeVisible());
    await expect(
      canvas.getByText(
        "LINE連携済みのスタッフには通常LINEで送ります。LINEを連携していない場合、友だち追加が解除されている場合、またはLINE送信の上限に達した場合はメールへ切り替えます。",
      ),
    ).toBeVisible();
    await expect(await canvas.findByRole("link", { name: "通知先の確認方法を見る" })).toHaveAttribute(
      "href",
      "/howto#notification-channel",
    );
  },
};
