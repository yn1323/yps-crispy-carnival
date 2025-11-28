import { Flex, Spinner } from "@chakra-ui/react";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InviteShopStaff } from "@/src/components/features/Shop/Invite";
import { userAtom } from "@/src/stores/user";

export const InvitePage = () => {
  const params = useParams({ strict: false });
  const shopId = params.shopId as string;
  const user = useAtomValue(userAtom);

  // 招待一覧を取得
  const invitations = useQuery(
    api.invite.getInvitationsByShopId,
    user.authId ? { shopId: shopId as Id<"shops">, authId: user.authId } : "skip",
  );

  // ローディング
  if (invitations === undefined) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" color="teal.500" />
      </Flex>
    );
  }

  return <InviteShopStaff invitations={invitations} />;
};
