import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { StaffRegistrationFormData } from "@/convex/staffRegistration/schemas";
import { StaffRegistrationPage, type StaffRegistrationPageData } from "@/src/components/features/StaffRegistration";
import { StaffLayout } from "@/src/components/templates/StaffLayout";
import { FullPageSpinner } from "@/src/components/ui/FullPageSpinner";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";

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
  const submit = useMutation(api.staffRegistration.mutations.submitRegistrationRequest);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isSubmitted, setSubmitted] = useState(false);

  if (!token) {
    return (
      <StaffLayout shopName="スタッフ登録">
        <StaffRegistrationPage data={expiredRegistrationData} onSubmit={() => {}} />
      </StaffLayout>
    );
  }

  if (data === undefined) return <FullPageSpinner />;

  const pageData = data as StaffRegistrationPageData;
  const shopName = pageData.status === "ok" ? pageData.shopName : "スタッフ登録";

  const handleSubmit = async (formData: StaffRegistrationFormData) => {
    try {
      setSubmitting(true);
      await submit({
        token,
        name: formData.name,
        email: formData.email,
        acceptedLegal: formData.acceptedLegal,
      });
      setSubmitted(true);
      toaster.create({ title: "参加申請を送りました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffLayout shopName={shopName}>
      <StaffRegistrationPage
        data={pageData}
        isSubmitting={isSubmitting}
        isSubmitted={isSubmitted}
        onSubmit={handleSubmit}
      />
    </StaffLayout>
  );
}
