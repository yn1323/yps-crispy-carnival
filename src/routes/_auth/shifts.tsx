import { Button } from "@chakra-ui/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { LuCalendar } from "react-icons/lu";
import { Animation } from "@/src/components/templates/Animation";
import { Empty } from "@/src/components/ui/Empty";
import { selectedShopAtom } from "@/src/stores/shop";

const RouteComponent = () => {
  const navigate = useNavigate();
  const selectedShop = useAtomValue(selectedShopAtom);

  useEffect(() => {
    if (selectedShop?.shopId) {
      navigate({
        to: "/shops/$shopId/shifts",
        params: { shopId: selectedShop.shopId },
      });
    }
  }, [selectedShop, navigate]);

  // 店舗未選択の場合
  if (!selectedShop) {
    return (
      <Animation>
        <Empty
          icon={LuCalendar}
          title="店舗が選択されていません"
          description="シフト管理を利用するには、店舗を選択してください"
          action={
            <Link to="/mypage">
              <Button colorPalette="teal">マイページで店舗を選択</Button>
            </Link>
          }
        />
      </Animation>
    );
  }

  // リダイレクト中
  return null;
};

export const Route = createFileRoute("/_auth/shifts")({
  component: RouteComponent,
});
