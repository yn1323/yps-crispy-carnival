import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { UserEdit } from "@/src/components/features/User/UserEdit";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { userAtom } from "@/src/stores/user";

type Props = {
  userId: string;
  shopId: string;
};

export const StaffEditPage = ({ userId, shopId }: Props) => {
  const [user] = useAtom(userAtom);

  // ユーザー情報取得
  const staffData = useQuery(
    api.user.getUserById,
    user.authId ? { userId: userId as Id<"users">, authId: user.authId, shopId } : "skip",
  );

  // 現在のユーザー権限取得
  const currentUserRole = useQuery(
    api.shop.getUserRoleInShop,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // 店舗情報取得
  const shop = useQuery(api.shop.getShopById, { shopId: shopId as Id<"shops"> });

  // スタッフ管理情報取得
  const shopUserInfo = useQuery(
    api.shop.getShopUserInfo,
    user.authId ? { shopId, userId, authId: user.authId } : "skip",
  );

  // ローディング
  if (staffData === undefined || currentUserRole === undefined || shop === undefined || shopUserInfo === undefined) {
    return <LoadingState />;
  }

  // スタッフが見つからない
  if (staffData === null) {
    return (
      <Box textAlign="center" py="20">
        <Stack gap="6" alignItems="center">
          <Heading size="lg" color="fg.muted">
            スタッフが見つかりません
          </Heading>
          <Text color="fg.muted">指定されたスタッフは存在しないか、削除された可能性があります</Text>
        </Stack>
      </Box>
    );
  }

  // 制限ビューチェック（他人の情報を編集しようとしている場合）
  if ("isLimitedView" in staffData && staffData.isLimitedView) {
    return (
      <Box textAlign="center" py="20">
        <Stack gap="6" alignItems="center">
          <Heading size="lg" color="red.500">
            権限がありません
          </Heading>
          <Text color="fg.muted">このスタッフを編集する権限がありません</Text>
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
          <Text color="fg.muted">このスタッフを編集する権限がありません</Text>
        </Stack>
      </Box>
    );
  }

  // 店舗が見つからない場合
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

  // スタッフ管理情報が取得できない場合（権限不足）
  if (shopUserInfo === null) {
    return (
      <Box textAlign="center" py="20">
        <Stack gap="6" alignItems="center">
          <Heading size="lg" color="red.500">
            権限がありません
          </Heading>
          <Text color="fg.muted">このスタッフの情報を閲覧する権限がありません</Text>
        </Stack>
      </Box>
    );
  }

  // 通常表示（制限ビューでないことが確認済み）
  // 制限ビューチェック後なので、staffDataはDoc<"users">型として扱える
  return (
    <UserEdit
      user={staffData as Doc<"users">}
      shopId={shopId}
      shopName={shop.shopName}
      shopUserInfo={shopUserInfo}
      callbackRoutingPath={`/shops/${shopId}/staffs/${userId}`}
    />
  );
};
