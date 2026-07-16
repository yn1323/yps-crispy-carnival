import { Box } from "@chakra-ui/react";
import { api } from "@/convex/_generated/api";
import { OrganizationSettings, OrganizationSettingsSkeleton } from "@/src/components/features/OrganizationSettings";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { useShopQuery } from "@/src/hooks/useShopQuery";

export function OrganizationSettingsPage({ defaultTab = "people" }: { defaultTab?: "people" | "shops" | "billing" }) {
  const settings = useShopQuery(api.organization.queries.getSettings, {});

  return (
    <SettingsPageLayout
      content={
        settings ? (
          <OrganizationSettings settings={settings} defaultTab={defaultTab} />
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
