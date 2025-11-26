import { Badge, Box, Button, Card, Flex, Icon, Input, InputGroup, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuChevronRight, LuPlus, LuSearch, LuUser, LuUsers } from "react-icons/lu";
import type { Doc } from "@/convex/_generated/dataModel";
import { Animation } from "@/src/components/templates/Animation";
import { Select } from "@/src/components/ui/Select";
import { convertRole } from "@/src/helpers/domain/convertShopData";

type UserWithRole = {
  _id: Doc<"users">["_id"];
  name: string;
  displayName: string;
  authId: string | undefined;
  role: string;
  status: string;
  createdAt: number;
};

type UserWithRoles = {
  _id: Doc<"users">["_id"];
  name: string;
  displayName: string;
  authId: string | undefined;
  roles: string[];
  status: string;
  createdAt: number;
};

type StaffTabProps = {
  shop: Doc<"shops">;
  users: UserWithRole[];
  canEdit: boolean;
};

export const StaffTab = ({ shop, users, canEdit }: StaffTabProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [roleFilter, setRoleFilter] = useState("all");

  // ユーザーごとに全てのロールをまとめる
  const uniqueUsers = users.reduce((acc, user) => {
    const existing = acc.find((u) => u._id === user._id);
    if (!existing) {
      acc.push({
        _id: user._id,
        name: user.name,
        displayName: user.displayName,
        authId: user.authId,
        roles: [user.role],
        status: user.status,
        createdAt: user.createdAt,
      });
    } else {
      if (!existing.roles.includes(user.role)) {
        existing.roles.push(user.role);
      }
    }
    return acc;
  }, [] as UserWithRoles[]);

  const getRolePriority = (role: string) => {
    if (role === "owner") return 3;
    if (role === "manager") return 2;
    return 1;
  };

  // ロールを優先度順にソート（owner > manager > general）し、ユーザー間も役割順でソート
  const sortedUsers = uniqueUsers
    .map((user) => ({
      ...user,
      roles: user.roles.toSorted((a, b) => getRolePriority(b) - getRolePriority(a)),
    }))
    .toSorted((a, b) => getRolePriority(b.roles[0]) - getRolePriority(a.roles[0]));

  // 検索とフィルタリング機能
  const filteredUsers = sortedUsers.filter((user) => {
    // 名前検索（nameとdisplayName両方で検索）
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      user.name.toLowerCase().includes(searchLower) || user.displayName.toLowerCase().includes(searchLower);

    // 役割フィルター
    const matchesRole =
      roleFilter === "all" ||
      user.roles.some((role) => {
        if (roleFilter === "オーナー") return role === "owner";
        if (roleFilter === "マネージャー") return role === "manager";
        if (roleFilter === "スタッフ") return role === "general";
        return false;
      });

    // ステータスフィルター（在籍中にはpendingも含める）
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && (user.status === "active" || user.status === "pending")) ||
      (statusFilter === "retired" && user.status === "retired");

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
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
                placeholder="名前で検索..."
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
              { value: "retired", label: "退職済み" },
              { value: "all", label: "全員" },
            ]}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value)}
            w={{ base: "full", md: "180px" }}
          />

          {/* 役割フィルター */}
          <Select
            items={[
              { value: "all", label: "全員" },
              { value: "オーナー", label: "オーナー" },
              { value: "マネージャー", label: "マネージャー" },
              { value: "スタッフ", label: "スタッフ" },
            ]}
            value={roleFilter}
            onChange={(value) => setRoleFilter(value)}
            w={{ base: "full", md: "180px" }}
          />
        </Flex>

        {/* スタッフ招待ボタン */}
        {canEdit && (
          <Link to="/shops/$shopId/invite" params={{ shopId: shop._id }} search={{ fromTab: "staff" }}>
            <Button w={{ base: "full", md: "auto" }} colorPalette="teal" gap={2}>
              <Icon as={LuPlus} boxSize={4} />
              スタッフを招待
            </Button>
          </Link>
        )}
      </Box>

      {/* フィルター結果表示 */}
      {filteredUsers.length > 0 ? (
        <>
          <Text fontSize="sm" color="gray.600" mb={3}>
            {filteredUsers.length}名のスタッフ
          </Text>
          <Box>
            {filteredUsers.map((user) => (
              <Link
                key={user._id}
                to="/shops/$shopId/staffs/$userId"
                params={{ shopId: shop._id, userId: user._id }}
                search={{ fromTab: "staff" }}
              >
                <Card.Root
                  mb={{ base: 2, md: 3 }}
                  borderWidth={0}
                  shadow="sm"
                  _hover={{ shadow: "md" }}
                  transition="all 0.15s"
                  cursor="pointer"
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
                          <Flex align="center" gap={2} flexWrap="wrap">
                            <Text fontSize={{ base: "sm", md: "base" }} color="gray.900" truncate>
                              {user.displayName}
                            </Text>
                            {/* 仮登録バッジ */}
                            {user.status === "pending" && (
                              <Badge colorPalette="orange" size="sm" flexShrink={0}>
                                仮登録
                              </Badge>
                            )}
                            {/* 役割バッジ */}
                            {user.roles.map((role) => (
                              <Badge key={role} colorPalette={convertRole.toBadgeColor(role)} size="sm" flexShrink={0}>
                                {convertRole.toLabel(role)}
                              </Badge>
                            ))}
                          </Flex>
                        </Box>
                      </Flex>

                      {/* 矢印アイコン */}
                      <Icon as={LuChevronRight} boxSize={5} color="gray.400" />
                    </Flex>
                  </Card.Body>
                </Card.Root>
              </Link>
            ))}
          </Box>
        </>
      ) : (
        <Card.Root borderWidth={0} shadow="sm">
          <Card.Body p={8} textAlign="center">
            <Box display="flex" justifyContent="center" mb={3}>
              <Icon as={LuUsers} boxSize={12} color="gray.300" />
            </Box>
            <Text color="gray.500">該当するスタッフが見つかりませんでした</Text>
            <Text fontSize="sm" color="gray.400" mt={1}>
              検索条件を変更してください
            </Text>
          </Card.Body>
        </Card.Root>
      )}
    </Animation>
  );
};
