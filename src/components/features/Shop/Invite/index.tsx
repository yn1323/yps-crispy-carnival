import { Container, Icon, Tabs, Text } from "@chakra-ui/react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { LuLink2, LuSend } from "react-icons/lu";
import { Animation } from "@/src/components/templates/Animation";
import { Title } from "@/src/components/ui/Title";
import type { InvitationType } from "./TabContents/ManageTab";
import { ManageTab } from "./TabContents/ManageTab";
import { SendTab } from "./TabContents/SendTab";

export const InviteShopStaffTabTypes = ["send", "manage"] as const;

type InviteShopStaffProps = {
  invitations: InvitationType[];
};

export const InviteShopStaff = ({ invitations }: InviteShopStaffProps) => {
  const params = useParams({ strict: false });
  const shopId = params.shopId as string;
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const currentTab = search.tab || "send";
  const fromTab = search.fromTab;

  const handleTabChange = (value: string) => {
    navigate({
      to: "/shops/$shopId/invite",
      params: { shopId },
      search: { tab: value as (typeof InviteShopStaffTabTypes)[number] },
      replace: true,
    });
  };

  return (
    <Animation>
      <Container maxW="6xl">
        {/* ヘッダー */}
        <Title prev={{ url: `/shops/${shopId}${fromTab ? `?tab=${fromTab}` : ""}`, label: "店舗詳細に戻る" }}>
          スタッフ招待
        </Title>

        {/* タブ */}
        <Tabs.Root value={currentTab} onValueChange={(e) => handleTabChange(e.value)} w="full" variant="enclosed">
          <Tabs.List mb={{ base: 4, md: 6 }}>
            <Tabs.Trigger value="send" gap={2}>
              <Icon as={LuSend} boxSize={4} />
              <Text display={{ base: "none", sm: "inline" }}>招待を送る</Text>
              <Text display={{ base: "inline", sm: "none" }}>送る</Text>
            </Tabs.Trigger>
            <Tabs.Trigger value="manage" gap={2}>
              <Icon as={LuLink2} boxSize={4} />
              <Text display={{ base: "none", sm: "inline" }}>招待管理</Text>
              <Text display={{ base: "inline", sm: "none" }}>管理</Text>
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="send">
            <SendTab shopId={shopId} />
          </Tabs.Content>
          <Tabs.Content value="manage">
            <ManageTab invitations={invitations} />
          </Tabs.Content>
        </Tabs.Root>
      </Container>
    </Animation>
  );
};
