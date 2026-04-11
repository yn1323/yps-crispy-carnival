import type { Meta, StoryObj } from "@storybook/react-vite";
import { TitleTemplate } from "@/src/components/templates/TitleTemplate";

const meta = {
  title: "templates/TitleTemplate",
  component: TitleTemplate,
  args: {
    title: "タイトル",
    breadCrumbs: [
      { label: "ダッシュボード", path: "/mypage" },
      { label: "店舗一覧", path: "/shops" },
      { label: "店舗詳細", path: "" },
    ],
    children: <div>コンテンツが入ります</div>,
  },
} satisfies Meta<typeof TitleTemplate>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
