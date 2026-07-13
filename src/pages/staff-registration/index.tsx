import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StaffRegistration, type StaffRegistrationPageData } from "@/src/components/features/StaffRegistration";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { StaffLayout } from "@/src/components/templates/StaffLayout";

type Props = {
  token: string | undefined;
};

const expiredRegistrationData: StaffRegistrationPageData = {
  status: "expired",
  documents: {
    terms: { title: "スタッフ向け利用規約", path: "/terms/staff" },
    privacy: { title: "スタッフ向けプライバシーポリシー", path: "/privacy/staff" },
  },
};

export function StaffRegistrationRoutePage({ token }: Props) {
  const data = useQuery(api.staffRegistration.queries.getRegistrationPageData, token ? { token } : "skip");

  if (!token) {
    return (
      <StaffLayout shopName="スタッフ登録">
        <StaffRegistration token={token} data={expiredRegistrationData} />
      </StaffLayout>
    );
  }

  if (data === undefined) return <FullPageSpinner />;

  const pageData = data as StaffRegistrationPageData;
  const shopName = pageData.status === "ok" ? pageData.shopName : "スタッフ登録";

  return (
    <StaffLayout shopName={shopName}>
      <StaffRegistration token={token} data={pageData} />
    </StaffLayout>
  );
}
