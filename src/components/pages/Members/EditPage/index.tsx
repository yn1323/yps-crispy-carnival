import { Box, Heading, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MemberEdit } from "@/src/components/features/Member/MemberEdit";
import { TitleTemplate } from "@/src/components/templates/TitleTemplate";
import { userAtom } from "@/src/stores/user";

type Props = {
  userId: string;
  shopId: string;
};

export const MembersEditPage = ({ userId, shopId }: Props) => {
  const [user] = useAtom(userAtom);

  // ユーザー情報取得
  const memberData = useQuery(api.user.getUserById, { userId: userId as Id<"users"> });

  // 現在のユーザー権限取得
  const currentUserRole = useQuery(
    api.shop.getUserRoleInShop,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // ローディング
  if (memberData === undefined || currentUserRole === undefined) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minH="400px">
        <VStack gap="4">
          <Spinner size="xl" color="teal.500" />
          <Text color="fg.muted">読み込み中...</Text>
        </VStack>
      </Box>
    );
  }

  // メンバーが見つからない
  if (memberData === null) {
    return (
      <Box textAlign="center" py="20">
        <Stack gap="6" alignItems="center">
          <Heading size="lg" color="fg.muted">
            メンバーが見つかりません
          </Heading>
          <Text color="fg.muted">指定されたメンバーは存在しないか、削除された可能性があります</Text>
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
          <Text color="fg.muted">このメンバーを編集する権限がありません</Text>
        </Stack>
      </Box>
    );
  }

  // 通常表示
  return (
    <TitleTemplate
      title="メンバー編集"
      breadCrumbs={[
        { label: "マイページ", path: "/mypage" },
        { label: "所属店舗一覧", path: "/shops" },
        { label: "店舗詳細", path: `/shops/${shopId}` },
        { label: "メンバー詳細", path: `/shops/${shopId}/members/${userId}` },
        { label: "メンバー編集" },
      ]}
    >
      <MemberEdit user={memberData} shopId={shopId} callbackRoutingPath={`/shops/${shopId}/members/${userId}`} />
    </TitleTemplate>
  );
};
