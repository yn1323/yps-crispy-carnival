import { Box } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { OrganizationSettings, OrganizationSettingsSkeleton } from "@/src/components/features/OrganizationSettings";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { isSelectableShop, normalizeShopContextOptions, selectedShopAtom } from "@/src/stores/shop";

type SettingsTab = "people" | "shops" | "billing";

export function OrganizationSettingsPage({
  defaultTab = "people",
  onTabChange,
}: {
  defaultTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
}) {
  const settings = useShopQuery(api.organization.queries.getSettings, {});
  const rawShops = useQuery(api.dashboard.queries.getMyShops, {});
  const selectedShop = useAtomValue(selectedShopAtom);
  const shops = useMemo(() => normalizeShopContextOptions(rawShops ?? []).filter(isSelectableShop), [rawShops]);

  return (
    <SettingsPageLayout
      content={
        settings && rawShops !== undefined && selectedShop ? (
          <OrganizationSettings
            settings={settings}
            context={{ shops, selectedShopId: selectedShop.shopId }}
            defaultTab={defaultTab}
            onTabChange={onTabChange}
          />
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
