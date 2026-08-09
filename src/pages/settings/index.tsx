import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { OrganizationSettings, OrganizationSettingsSkeleton } from "@/src/components/features/OrganizationSettings";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { normalizeOrganizationSettingsFeatures } from "@/src/domains/featureVisibility";
import { groupShopsByOrganization, isSelectableShop, normalizeShopContextOptions } from "@/src/domains/shop/context";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { selectedShopAtom } from "@/src/stores/shop";

type SettingsTab = "people" | "shops" | "billing" | "settings";

export function OrganizationSettingsPage({
  defaultTab = "people",
  onTabChange,
  visibleUserCount,
  focusedPersonId,
  onVisibleUserCountChange,
}: {
  defaultTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
  visibleUserCount?: number;
  focusedPersonId?: string;
  onVisibleUserCountChange?: (count: number) => void;
}) {
  const settings = useShopQuery(api.organization.queries.getSettings, {});
  const rawShops = useQuery(api.dashboard.queries.getMyShops, {});
  const selectedShop = useAtomValue(selectedShopAtom);
  const shops = useMemo(() => normalizeShopContextOptions(rawShops ?? []).filter(isSelectableShop), [rawShops]);

  return (
    <AuthenticatedPageContent>
      {settings && rawShops !== undefined && selectedShop ? (
        <OrganizationSettings
          settings={settings}
          context={{ shops, selectedShopId: selectedShop.shopId }}
          defaultTab={defaultTab}
          onTabChange={onTabChange}
          initialVisibleUserCount={visibleUserCount}
          focusedPersonId={focusedPersonId}
          onVisibleUserCountChange={onVisibleUserCountChange}
        />
      ) : (
        <OrganizationSettingsSkeleton
          defaultTab={defaultTab}
          showOrganizationSelector={rawShops !== undefined && groupShopsByOrganization(shops).length > 1}
          features={normalizeOrganizationSettingsFeatures(settings?.features)}
        />
      )}
    </AuthenticatedPageContent>
  );
}
