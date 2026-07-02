import type { ReactNode } from "react";
import { getLegalDocumentsForAudience, type LegalAudience } from "@/convex/legal/documents";
import { LegalDocumentPage } from "@/src/components/features/LegalPage";
import { parseLegalDocuments } from "@/src/components/features/LegalPage/legalContent";

const contentModules = import.meta.glob<string>("./content/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const contents = parseLegalDocuments(contentModules);

type Props = {
  audience?: LegalAudience;
};

export function PrivacyPolicy({ audience = "manager" }: Props): ReactNode {
  return <LegalDocumentPage content={contents[audience]} info={getLegalDocumentsForAudience(audience).privacy} />;
}
