import { useAtomValue } from "jotai";
import { FeatureRequestAction } from "@/src/components/features/FeatureRequestDialog";
import { Header } from "@/src/components/templates/Header";
import { hasSelectedShopAtom } from "@/src/stores/shop";

export const AuthenticatedHeader = () => {
  const hasSelectedShop = useAtomValue(hasSelectedShopAtom);
  // 店舗削除入口は誤操作リスクを再検討するため一時停止中。
  return <Header userActions={hasSelectedShop ? <FeatureRequestAction /> : undefined} />;
};
