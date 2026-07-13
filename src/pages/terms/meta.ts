import { buildLinks, buildMeta } from "@/src/lib/seo";

const buildTermsPageHead = ({
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

export const buildGeneralTermsPageHead = () =>
  buildTermsPageHead({
    title: "利用規約",
    description: "シフトリの利用規約",
    canonical: "/terms",
  });

export const buildManagerTermsPageHead = () =>
  buildTermsPageHead({
    title: "管理ユーザー向け利用規約",
    description: "シフトリの管理ユーザー向け利用規約",
    canonical: "/terms/manager",
  });

export const buildStaffTermsPageHead = () =>
  buildTermsPageHead({
    title: "スタッフ向け利用規約",
    description: "シフトリのスタッフ向け利用規約",
    canonical: "/terms/staff",
  });
