import { Box } from "@chakra-ui/react";
import { api } from "@/convex/_generated/api";
import { OrganizationSettings, OrganizationSettingsSkeleton } from "@/src/components/features/OrganizationSettings";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { useShopQuery } from "@/src/hooks/useShopQuery";

type SettingsTab = "people" | "shops" | "billing";

export function OrganizationSettingsPage({
  defaultTab = "people",
  onTabChange,
}: {
  defaultTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
}) {
  const settings = useShopQuery(api.organization.queries.getSettings, {});

  return (
    <SettingsPageLayout
      content={
        settings ? (
          <OrganizationSettings settings={settings} defaultTab={defaultTab} onTabChange={onTabChange} />
        ) : (
          <OrganizationSettingsSkeleton />
        )
      }
    />
  );
}

function SettingsPageLayout({ content }: { content: React.ReactNode }) {
  return (
    <Box minH="calc(100dvh - 68px)" bg="gray.50">
      <RootContentWrapper>{content}</RootContentWrapper>
    </Box>
  );
}
