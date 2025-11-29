import { Badge, Box, Button, Card, Flex, Icon, Input, InputGroup, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuChevronRight, LuPlus, LuSearch, LuUser, LuUsers } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffAddModal } from "@/src/components/features/Shop/StaffAddModal";
import { Animation } from "@/src/components/templates/Animation";
import { useDialog } from "@/src/components/ui/Dialog";
import { Select } from "@/src/components/ui/Select";
import { userAtom } from "@/src/stores/user";

type StaffType = {
  _id: Id<"staffs">;
  email: string;
  displayName: string;
  status: string;
  skills: { position: string; level: string }[];
  maxWeeklyHours: number | undefined;
  createdAt: number;
  isManager: boolean;
};

type StaffTabProps = {
  staffs: StaffType[];
  canEdit: boolean;
  shopId: Id<"shops">;
};

export const StaffTab = ({ staffs, canEdit, shopId }: StaffTabProps) => {
  const user = useAtomValue(userAtom);
  const addDialog = useDialog();
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

  // ソート: マネージャー優先、次に作成日順（新しい順）
  const sortedStaffs = filteredStaffs.toSorted((a, b) => {
    // マネージャーを先に
    if (a.isManager !== b.isManager) {
      return a.isManager ? -1 : 1;
    }
    // 同じロールなら作成日順（新しい順）
    return b.createdAt - a.createdAt;
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

        {/* スタッフ追加ボタン */}
        {canEdit && (
          <Button w={{ base: "full", md: "auto" }} colorPalette="teal" gap={2} onClick={addDialog.open}>
            <Icon as={LuPlus} boxSize={4} />
            スタッフを追加
          </Button>
        )}
      </Box>

      {/* スタッフ追加モーダル */}
      {user.authId && (
        <StaffAddModal
          shopId={shopId}
          authId={user.authId}
          isOpen={addDialog.isOpen}
          onOpenChange={addDialog.onOpenChange}
          onClose={addDialog.close}
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
                params={{ shopId, staffId: staff._id }}
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
                          <Flex align="center" gap={2} flexWrap="wrap">
                            <Text fontSize={{ base: "sm", md: "base" }} color="gray.900" truncate>
                              {staff.displayName}
                            </Text>
                            {/* ロールバッジ（マネージャーのみ表示） */}
                            {staff.isManager && (
                              <Badge colorPalette="purple" size="sm" flexShrink={0}>
                                マネージャー
                              </Badge>
                            )}
                            {/* ステータスバッジ */}
                            {staff.status === "pending" && (
                              <Badge colorPalette="orange" size="sm" flexShrink={0}>
                                招待中
                              </Badge>
                            )}
                            {staff.status === "resigned" && (
                              <Badge colorPalette="gray" size="sm" flexShrink={0}>
                                退職済み
                              </Badge>
                            )}
                          </Flex>
                          {/* スキル表示 */}
                          {staff.skills.length > 0 && (
                            <Flex gap={1} mt={1} flexWrap="wrap">
                              {staff.skills.map((skill, idx) => (
                                <Badge key={idx} colorPalette="teal" variant="subtle" size="sm">
                                  {skill.position}
                                </Badge>
                              ))}
                            </Flex>
                          )}
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
