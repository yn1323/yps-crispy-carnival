import { PrivacyPolicy } from "@/src/components/features/PrivacyPolicy";

type PrivacyAudience = "manager" | "staff";

export function PrivacyPage({ audience }: { audience?: PrivacyAudience }) {
  return <PrivacyPolicy audience={audience} />;
}
