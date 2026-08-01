import { Terms } from "@/src/components/features/Terms";

type TermsAudience = "manager" | "staff";

export function TermsPage({ audience }: { audience?: TermsAudience }) {
  return <Terms audience={audience} />;
}
