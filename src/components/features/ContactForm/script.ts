import type { ContactFormData } from "@/convex/contact/schemas";

export function createContactFormDefaultValues(): ContactFormData {
  return {
    type: "introduction",
    name: "",
    email: "",
    organization: "",
    message: "",
    acceptedPrivacy: false,
  };
}

const MESSAGE_PLACEHOLDERS: Record<ContactFormData["type"], string> = {
  introduction: "例：10名ほどでの利用を検討しています。料金や開始方法を教えてください。",
  usage: "例：確定したシフトを変更する方法を教えてください。",
  trouble: "例：シフトを確定しようとすると「○○」と表示されます。再読み込みしても同じ状態です。",
  other: "お問い合わせ内容をご記載ください。",
};

export function getContactMessagePresentation(type: ContactFormData["type"]): {
  placeholder: string;
  showTroubleGuidance: boolean;
} {
  return {
    placeholder: MESSAGE_PLACEHOLDERS[type],
    showTroubleGuidance: type === "trouble",
  };
}
