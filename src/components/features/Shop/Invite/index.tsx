import { Container, Icon, Tabs, Text } from "@chakra-ui/react";
import { useParams } from "@tanstack/react-router";
import { LuLink2, LuSend, LuUsers } from "react-icons/lu";
import { Animation } from "@/src/components/templates/Animation";
import { Title } from "@/src/components/ui/Title";
import { ManageTab } from "./TabContents/ManageTab";
import { SendTab } from "./TabContents/SendTab";
import { StaffHistoryTab } from "./TabContents/StaffHistoryTab";

export const InviteShopMember = () => {
  const params = useParams({ strict: false });
  const shopId = params.shopId as string;

  // TODO: 実際のAPI呼び出しで店舗名を取得
  const shopName = "カフェ渋谷店";

  return (
    <Animation>
      <Container maxW="6xl">
        {/* ヘッダー */}
        <Title prev={{ url: `/shops/${shopId}`, label: "店舗詳細に戻る" }}>
          <Text fontSize="sm" color="gray.600">
            {shopName}
          </Text>
        </Title>

        {/* タブ */}
        <Tabs.Root defaultValue="send" w="full" variant="enclosed">
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
            <Tabs.Trigger value="staff" gap={2}>
              <Icon as={LuUsers} boxSize={4} />
              <Text display={{ base: "none", sm: "inline" }}>スタッフ</Text>
              <Text display={{ base: "inline", sm: "none" }}>履歴</Text>
            </Tabs.Trigger>
          </Tabs.List>

          {/* 招待を送るタブ */}
          <Tabs.Content value="send">
            <SendTab shopId={shopId} />
          </Tabs.Content>

          {/* 招待管理タブ */}
          <Tabs.Content value="manage">
            <ManageTab shopId={shopId} />
          </Tabs.Content>

          {/* スタッフタブ */}
          <Tabs.Content value="staff">
            <StaffHistoryTab shopId={shopId} />
          </Tabs.Content>
        </Tabs.Root>
      </Container>
    </Animation>
  );
};
