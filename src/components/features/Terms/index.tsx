import type { ReactNode } from "react";
import { getLegalDocumentsForAudience, type LegalAudience } from "@/convex/legal/documents";
import { LegalDocumentPage } from "@/src/components/features/LegalPage";
import { buildLegalDocuments, type LegalMdxComponent } from "@/src/components/features/LegalPage/legalContent";

const componentModules = import.meta.glob<LegalMdxComponent>("./content/*.mdx", {
  eager: true,
  query: "?mdx-component",
  import: "default",
});

const frontmatterModules = import.meta.glob<unknown>("./content/*.mdx", {
  eager: true,
  query: "?mdx-frontmatter",
  import: "default",
});

const contents = buildLegalDocuments(componentModules, frontmatterModules);

type Props = {
  audience?: LegalAudience;
};

export function Terms({ audience = "manager" }: Props): ReactNode {
  return <LegalDocumentPage content={contents[audience]} info={getLegalDocumentsForAudience(audience).terms} />;
}
