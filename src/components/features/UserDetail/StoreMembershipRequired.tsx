import type { ElementType } from "react";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import type { UserDetailData } from "./types";

export function StoreMembershipRequired({
  data,
  onSelectShop,
  featureName,
  icon,
}: {
  data: UserDetailData;
  onSelectShop: (shopId: string) => void;
  featureName: string;
  icon: ElementType;
}) {
  const firstMembership = data.memberships[0];
  return (
    <Empty
      icon={icon}
      title={data.memberships.length === 0 ? `店舗別の${featureName}はありません` : "この店舗には所属していません"}
      description={
        data.memberships.length === 0
          ? `店舗へスタッフとして所属すると、${featureName}を確認できます。`
          : `所属している店舗へ切り替えると、${featureName}を確認できます。`
      }
      variant="section"
      py={{ base: 10, md: 12 }}
      action={
        firstMembership ? (
          <Button colorPalette="teal" variant="outline" onClick={() => onSelectShop(firstMembership.shopId)}>
            {firstMembership.shopName}へ切り替える
          </Button>
        ) : undefined
      }
    />
  );
}
