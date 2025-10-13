import { Box, Heading, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopEdit } from "@/src/components/features/Shop/ShopEdit";
import { TitleTemplate } from "@/src/components/templates/TitleTemplate";
import { userAtom } from "@/src/stores/user";

type Props = {
  shopId: string;
};

export const ShopsEditPage = ({ shopId }: Props) => {
  const [user] = useAtom(userAtom);

  // 店舗情報取得
  const shop = useQuery(api.shop.getShopById, { shopId: shopId as Id<"shops"> });

  // 現在のユーザー権限取得
  const currentUserRole = useQuery(
    api.shop.getUserRoleInShop,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // ローディング
  if (shop === undefined || currentUserRole === undefined) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minH="400px">
        <VStack gap="4">
          <Spinner size="xl" color="teal.500" />
          <Text color="fg.muted">読み込み中...</Text>
        </VStack>
      </Box>
    );
  }

  // 店舗が見つからない
  if (shop === null) {
    return (
      <Box textAlign="center" py="20">
        <Stack gap="6" alignItems="center">
          <Heading size="lg" color="fg.muted">
            店舗が見つかりません
          </Heading>
          <Text color="fg.muted">指定された店舗は存在しないか、削除された可能性があります</Text>
        </Stack>
      </Box>
    );
  }

  // 権限チェック
  if (currentUserRole !== "owner" && currentUserRole !== "manager") {
    return (
      <Box textAlign="center" py="20">
        <Stack gap="6" alignItems="center">
          <Heading size="lg" color="red.500">
            権限がありません
          </Heading>
          <Text color="fg.muted">この店舗を編集する権限がありません</Text>
        </Stack>
      </Box>
    );
  }

  // 通常表示
  return (
    <TitleTemplate
      title="店舗編集"
      breadCrumbs={[
        { label: "マイページ", path: "/mypage" },
        { label: "所属店舗一覧", path: "/shops" },
        { label: "店舗詳細", path: `/shops/${shopId}` },
        { label: "店舗編集" },
      ]}
    >
      <ShopEdit shop={shop} callbackRoutingPath={`/shops/${shopId}`} />
    </TitleTemplate>
  );
};
