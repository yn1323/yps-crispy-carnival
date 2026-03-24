import { Badge, Box, Button, Card, Container, Flex, Heading, Icon, Input, InputGroup, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuChevronRight, LuInfo, LuSearch, LuStore, LuUser, LuUserPlus, LuUsers } from "react-icons/lu";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { MemberAddModal } from "@/src/components/features/Shop/MemberAddModal";
import { Animation } from "@/src/components/templates/Animation";
import { useDialog } from "@/src/components/ui/Dialog";
import { Empty } from "@/src/components/ui/Empty";
import { LoadingState } from "@/src/components/ui/LoadingState";
import { Select } from "@/src/components/ui/Select";
import { Title } from "@/src/components/ui/Title";
import { Tooltip } from "@/src/components/ui/tooltip";
import { userAtom } from "@/src/stores/user";

type StaffType = {
  _id: Id<"staffs">;
  email: string;
  displayName: string;
  status: string;
  createdAt: number;
  isManager: boolean;
};

// 新テーブルからのスキル情報
type StaffSkillInfo = {
  positionId: string;
  positionName: string;
  level: string;
  order: number;
};

// staffId -> skills[] のマップ
type StaffSkillsMap = Record<string, StaffSkillInfo[]>;

type StaffListProps = {
  shop: Doc<"shops">;
  staffs: StaffType[];
  staffSkillsMap: StaffSkillsMap;
};

export const StaffList = ({ shop, staffs, staffSkillsMap }: StaffListProps) => {
  const user = useAtomValue(userAtom);
  const memberDialog = useDialog();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  // 検索とフィルタリング機能
  const filteredStaffs = staffs.filter((staff) => {
    // 名前・メール検索
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      staff.displayName.toLowerCase().includes(searchLower) || staff.email.toLowerCase().includes(searchLower);

    // ステータスフィルター（在籍中にはpendingも含める）
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && (staff.status === "active" || staff.status === "pending")) ||
      (statusFilter === "resigned" && staff.status === "resigned");

    return matchesSearch && matchesStatus;
  });

  // ソート: 退職ステータス → マネージャー優先 → 作成日順（古い順）
  const sortedStaffs = filteredStaffs.toSorted((a, b) => {
    // 退職済みを後ろに
    const aResigned = a.status === "resigned";
    const bResigned = b.status === "resigned";
    if (aResigned !== bResigned) {
      return aResigned ? 1 : -1;
    }
    // マネージャーを先に
    if (a.isManager !== b.isManager) {
      return a.isManager ? -1 : 1;
    }
    // 同じロールなら作成日順（古い順）
    return a.createdAt - b.createdAt;
  });

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: "/mypage", label: "マイページに戻る" }}
        action={
          <Button colorPalette="teal" gap={2} display={{ base: "none", md: "flex" }} onClick={memberDialog.open}>
            <Icon as={LuUserPlus} boxSize={4} />
            メンバーを追加
          </Button>
        }
      >
        <Flex align="center" gap={3}>
          <Flex p={{ base: 2, md: 3 }} bg="teal.50" borderRadius="lg">
            <Icon as={LuUsers} boxSize={6} color="teal.600" />
          </Flex>
          <Box>
            <Heading as="h2" size="xl" color="gray.900">
              スタッフ一覧
            </Heading>
            <Text fontSize="sm" color="gray.500">
              {shop.shopName}
            </Text>
          </Box>
        </Flex>
      </Title>

      <Animation>
        {/* 検索とフィルター */}
        <Box mb={4}>
          <Flex direction={{ base: "column", md: "row" }} gap={3} mb={3}>
            {/* 検索バー */}
            <Box position="relative" flex={1}>
              <InputGroup startElement={<Icon as={LuSearch} boxSize={4} color="gray.400" />}>
                <Input
                  background="white"
                  type="text"
                  placeholder="名前・メールで検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  pl={10}
                />
              </InputGroup>
            </Box>

            {/* ステータスフィルター */}
            <Select
              items={[
                { value: "active", label: "在籍中" },
                { value: "resigned", label: "退職済み" },
                { value: "all", label: "全員" },
              ]}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              w={{ base: "full", md: "180px" }}
            />
          </Flex>

          {/* モバイル用メンバー追加ボタン */}
          <Button
            w="full"
            colorPalette="teal"
            gap={2}
            display={{ base: "flex", md: "none" }}
            onClick={memberDialog.open}
          >
            <Icon as={LuUserPlus} boxSize={4} />
            メンバーを追加
          </Button>
        </Box>

        {/* メンバー追加モーダル */}
        {user.authId && (
          <MemberAddModal
            shopId={shop._id}
            authId={user.authId}
            isOpen={memberDialog.isOpen}
            onOpenChange={memberDialog.onOpenChange}
            onClose={memberDialog.close}
            onSuccess={() => {}}
          />
        )}

        {/* フィルター結果表示 */}
        {sortedStaffs.length > 0 ? (
          <>
            <Text fontSize="sm" color="gray.600" mb={3}>
              {sortedStaffs.length}名のスタッフ
            </Text>
            <Box>
              {sortedStaffs.map((staff) => (
                <Link
                  key={staff._id}
                  to="/shops/$shopId/staffs/$staffId"
                  params={{ shopId: shop._id, staffId: staff._id }}
                  style={{ textDecoration: "none" }}
                >
                  <Card.Root
                    mb={{ base: 2, md: 3 }}
                    borderWidth={0}
                    shadow="sm"
                    _hover={{ shadow: "md", cursor: "pointer" }}
                    transition="all 0.15s"
                  >
                    <Card.Body p={{ base: 3, md: 4 }}>
                      <Flex align="center" justify="space-between" gap={4}>
                        <Flex align="center" gap={3} flex={1} minW={0}>
                          {/* アバター */}
                          <Flex
                            w={{ base: 10, md: 12 }}
                            h={{ base: 10, md: 12 }}
                            borderRadius="full"
                            bgGradient="to-br"
                            gradientFrom="teal.400"
                            gradientTo="teal.600"
                            align="center"
                            justify="center"
                            color="white"
                            flexShrink={0}
                          >
                            <Icon as={LuUser} boxSize={6} />
                          </Flex>

                          {/* スタッフ情報 */}
                          <Box flex={1} minW={0}>
                            <Text fontSize={{ base: "sm", md: "base" }} color="gray.900" truncate>
                              {staff.displayName}
                            </Text>
                            {/* スキル表示（一人前以上のみ） */}
                            {(() => {
                              const staffSkills = staffSkillsMap[staff._id] || [];
                              const proficientSkills = staffSkills.filter(
                                (skill) => skill.level === "一人前" || skill.level === "ベテラン",
                              );
                              if (proficientSkills.length === 0) return null;
                              return (
                                <Flex gap={1} mt={1} flexWrap="wrap" align="center">
                                  {proficientSkills.map((skill) => (
                                    <Badge key={skill.positionId} colorPalette="teal" variant="subtle" size="sm">
                                      {skill.positionName}
                                    </Badge>
                                  ))}
                                  <Tooltip content="一人前以上のスキルを表示" showArrow>
                                    <Icon as={LuInfo} boxSize={3.5} color="gray.400" cursor="help" />
                                  </Tooltip>
                                </Flex>
                              );
                            })()}
                          </Box>
                        </Flex>

                        {/* ロールバッジ・ステータスバッジ + 矢印アイコン */}
                        <Flex align="center" gap={2} flexShrink={0}>
                          {staff.isManager && (
                            <Badge colorPalette="purple" size="sm">
                              マネージャー
                            </Badge>
                          )}
                          {staff.status === "pending" && (
                            <Badge colorPalette="orange" size="sm">
                              招待中
                            </Badge>
                          )}
                          {staff.status === "resigned" && (
                            <Badge colorPalette="gray" size="sm">
                              退職済み
                            </Badge>
                          )}
                          <Icon as={LuChevronRight} boxSize={5} color="gray.400" />
                        </Flex>
                      </Flex>
                    </Card.Body>
                  </Card.Root>
                </Link>
              ))}
            </Box>
          </>
        ) : (
          <Card.Root borderWidth={0} shadow="sm">
            <Card.Body p={8}>
              <Empty
                icon={LuUsers}
                title="該当するスタッフが見つかりませんでした"
                description="検索条件を変更してください"
                minH="auto"
              />
            </Card.Body>
          </Card.Root>
        )}
      </Animation>
    </Container>
  );
};

export const StaffListLoading = () => {
  return <LoadingState />;
};

export const StaffListNotFound = () => (
  <Empty
    icon={LuStore}
    title="店舗が見つかりません"
    description="指定された店舗は存在しないか、削除された可能性があります"
    action={
      <Link to="/mypage">
        <Button colorPalette="teal" size="lg">
          マイページに戻る
        </Button>
      </Link>
    }
  />
);
