import { buildLinks, buildMeta } from "@/src/lib/seo";

const buildPrivacyPageHead = ({
  title,
  description,
  canonical,
}: {
  title: string;
  description: string;
  canonical: string;
}) => ({
  links: buildLinks({ canonical }),
  meta: buildMeta({ title, description, canonical, noindex: true }),
});

export const buildGeneralPrivacyPageHead = () =>
  buildPrivacyPageHead({
    title: "プライバシーポリシー",
    description: "シフトリのプライバシーポリシー",
    canonical: "/privacy",
  });

export const buildManagerPrivacyPageHead = () =>
  buildPrivacyPageHead({
    title: "管理ユーザー向けプライバシーポリシー",
    description: "シフトリの管理ユーザー向けプライバシーポリシー",
    canonical: "/privacy/manager",
  });

export const buildStaffPrivacyPageHead = () =>
  buildPrivacyPageHead({
    title: "スタッフ向けプライバシーポリシー",
    description: "シフトリのスタッフ向けプライバシーポリシー",
    canonical: "/privacy/staff",
  });
