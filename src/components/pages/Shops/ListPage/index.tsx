import { Heading, Stack } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { api } from "@/convex/_generated/api";
import { ShopList, ShopListEmpty } from "@/src/components/features/Shop/ShopList";
import { uniqueBy } from "@/src/helpers/utils/array";
import { userAtom } from "@/src/stores/user";

export const ShopsListPage = () => {
  const [user] = useAtom(userAtom);
  const shops = useQuery(api.shop.getShopsByAuthId, user.authId ? { authId: user.authId } : "skip");

  // 店舗IDで重複排除
  const uniqueShops = shops ? uniqueBy(shops, ["_id"]) : [];

  if (!uniqueShops || uniqueShops.length === 0) {
    return <ShopListEmpty />;
  }

  return (
    <Stack gap="6" w="full">
      <Heading size="xl">所属店舗一覧</Heading>
      <ShopList shops={uniqueShops} />
    </Stack>
  );
};
