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
  introduction: "10名ほどでの利用を検討しています。\n料金や開始方法を教えてください。",
  usage: "確定シフトを変更する方法を教えてください。",
  trouble: "シフトを確定しようとすると「○○」と表示されます。\n再読み込みしても同じ状態です。",
  other: "○○について確認したいです。",
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
