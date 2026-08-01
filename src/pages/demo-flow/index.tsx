import { ShiftoriDemoFlow } from "@/src/components/features/Demo";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";

export function DemoFlowRoutePage() {
  return (
    <PublicPageLayout
      bg="gray.50"
      minH="100dvh"
      showFooter={false}
      headerProps={{ showLinks: false, showLogin: false }}
    >
      <ShiftoriDemoFlow />
    </PublicPageLayout>
  );
}
