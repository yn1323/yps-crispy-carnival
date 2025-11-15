import { Box, Button, Container, Flex, Heading, Icon, Spinner, Stack, Tabs, Text, VStack } from "@chakra-ui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LuPencil, LuStore, LuUsers } from "react-icons/lu";
import type { Doc } from "@/convex/_generated/dataModel";
import { Title } from "@/src/components/ui/Title";
import { InfoTab } from "./TabContents/InfoTab";
import { StaffTab } from "./TabContents/StaffTab";

type UserWithRole = {
  _id: Doc<"users">["_id"];
  name: string;
  authId: string;
  role: string;
  createdAt: number;
};

type ShopDetailProps = {
  shop: Doc<"shops">;
  users: UserWithRole[];
  userRole: string | null;
};

export const ShopDetail = ({ shop, users, userRole }: ShopDetailProps) => {
  const navigate = useNavigate();
  const canEdit = userRole === "owner" || userRole === "manager";

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: "/shops", label: "店舗一覧に戻る" }}
        action={
          canEdit ? (
            <Button
              onClick={() => {
                navigate({ to: "/shops/$shopId/edit", params: { shopId: shop._id } });
              }}
              colorPalette="teal"
              gap={2}
            >
              <Icon as={LuPencil} boxSize={4} />
              <Text display={{ base: "none", md: "inline" }}>編集</Text>
            </Button>
          ) : null
        }
      >
        <Flex align="center" justify="space-between">
          <Flex align="center" gap={3}>
            <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
              <Icon as={LuStore} boxSize={6} color="teal.600" />
            </Flex>
            <Heading as="h2" size="xl" color="gray.900">
              {shop.shopName}
            </Heading>
          </Flex>
        </Flex>
      </Title>

      {/* タブ */}
      <Tabs.Root defaultValue="info" w="full" variant="enclosed">
        <Tabs.List mb={{ base: 4, md: 6 }}>
          <Tabs.Trigger value="info" gap={2}>
            <Icon as={LuStore} boxSize={4} />
            店舗情報
          </Tabs.Trigger>
          <Tabs.Trigger value="staff" gap={2}>
            <Icon as={LuUsers} boxSize={4} />
            スタッフ ({users.length}名)
          </Tabs.Trigger>
        </Tabs.List>

        {/* 店舗情報タブ */}
        <Tabs.Content value="info">
          <InfoTab shop={shop} />
        </Tabs.Content>

        {/* スタッフタブ */}
        <Tabs.Content value="staff">
          <StaffTab shop={shop} users={users} canEdit={canEdit} />
        </Tabs.Content>
      </Tabs.Root>
    </Container>
  );
};

export const ShopDetailLoading = () => {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH="400px">
      <VStack gap="4">
        <Spinner size="xl" color="teal.500" />
        <Text color="fg.muted">読み込み中...</Text>
      </VStack>
    </Box>
  );
};

export const ShopDetailNotFound = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Box fontSize="6xl" color="fg.muted">
          <LuStore />
        </Box>
        <Heading size="lg" color="fg.muted">
          店舗が見つかりません
        </Heading>
        <Text color="fg.muted">指定された店舗は存在しないか、削除された可能性があります</Text>
        <Link to="/shops">
          <Button colorPalette="teal" size="lg">
            店舗一覧に戻る
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};

export const ShopDetailError = () => {
  return (
    <Box textAlign="center" py="20">
      <Stack gap="6" alignItems="center">
        <Heading size="lg" color="red.500">
          エラーが発生しました
        </Heading>
        <Text color="fg.muted">店舗情報の取得中にエラーが発生しました</Text>
        <Link to="/shops">
          <Button colorPalette="teal" size="lg">
            店舗一覧に戻る
          </Button>
        </Link>
      </Stack>
    </Box>
  );
};
