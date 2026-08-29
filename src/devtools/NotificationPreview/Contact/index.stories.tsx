import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildContactEmailSubject, buildContactEmailText } from "@/convex/contact/email";
import type { ContactDeliveryInput } from "@/convex/contact/schemas";
import { NotificationPreviewStoryFrame, TextEmailNotificationPreview } from "../shared";

const meta = {
  title: "devtools/NotificationPreview/お問い合わせ運用メール",
  component: NotificationPreviewStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof NotificationPreviewStoryFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

type ContactType = ContactDeliveryInput["type"];

const contactCases = {
  introduction: {
    type: "introduction",
    name: "山田 太郎",
    email: "taro.yamada@example.com",
    organization: "居酒屋さくら",
    message: "利用開始までの流れと、導入時に必要な準備について教えてください。",
    requestId: "11111111-1111-4111-8111-111111111111",
  },
  usage: {
    type: "usage",
    name: "山田 太郎",
    email: "taro.yamada@example.com",
    organization: "居酒屋さくら",
    message: "確定したシフトをスタッフへ再送する方法を確認したいです。",
    requestId: "22222222-2222-4222-8222-222222222222",
  },
  trouble: {
    type: "trouble",
    name: "山田 太郎",
    email: "taro.yamada@example.com",
    organization: "居酒屋さくら",
    message: "希望シフトを送信したあと、完了画面へ切り替わりませんでした。",
    requestId: "33333333-3333-4333-8333-333333333333",
  },
  other: {
    type: "other",
    name: "山田 太郎",
    email: "taro.yamada@example.com",
    organization: "",
    message: "取材について相談したいです。折り返しのご連絡をお願いします。",
    requestId: "44444444-4444-4444-8444-444444444444",
  },
} satisfies Record<ContactType, ContactDeliveryInput>;

const contactStory = (name: string, label: string, input: ContactDeliveryInput): Story => ({
  name,
  render: () => (
    <NotificationPreviewStoryFrame>
      <TextEmailNotificationPreview
        label={label}
        subject={buildContactEmailSubject(input.type)}
        text={buildContactEmailText(input)}
      />
    </NotificationPreviewStoryFrame>
  ),
});

export const Introduction = contactStory("利用開始について", "利用開始について", contactCases.introduction);
export const Usage = contactStory("機能や使い方", "機能や使い方", contactCases.usage);
export const Trouble = contactStory("不具合・トラブル", "不具合・トラブル", contactCases.trouble);
export const Other = contactStory("その他（店舗・会社名未入力）", "その他", contactCases.other);
