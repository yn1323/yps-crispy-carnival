import { Box, Button, Card, Container, Flex, Grid, Icon, Skeleton, SkeletonText, Text, VStack } from "@chakra-ui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LuMail, LuPencil, LuUser } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { StaffDetailContent } from "@/src/components/features/Staff/StaffDetailContent";
import { Animation } from "@/src/components/templates/Animation";
import { Empty } from "@/src/components/ui/Empty";
import { Title } from "@/src/components/ui/Title";

type StaffType = {
  _id: Id<"staffs">;
  email: string;
  displayName: string;
  status: string;
  maxWeeklyHours: number | undefined;
  memo: string;
  workStyleNote: string;
  hourlyWage: number | null;
  resignedAt: number | undefined;
  resignationReason: string | undefined;
  createdAt: number;
  isManager: boolean;
};

type ShopType = {
  _id: Id<"shops">;
  shopName: string;
};

type PositionType = {
  _id: Id<"shopPositions">;
  name: string;
  order: number;
};

type StaffSkillType = {
  _id: Id<"staffSkills">;
  positionId: Id<"shopPositions">;
  positionName: string;
  positionOrder: number;
  level: string;
};

type StaffDetailProps = {
  staff: StaffType;
  shop: ShopType;
  positions: PositionType[];
  staffSkills: StaffSkillType[];
};

export const StaffDetail = ({ staff, shop, positions, staffSkills }: StaffDetailProps) => {
  const navigate = useNavigate();

  // アバターのイニシャル生成
  const getInitials = (name: string) => {
    return name
      .split("")
      .slice(0, 2)
      .map((char) => char.toUpperCase())
      .join("");
  };

  return (
    <Container maxW="6xl">
      {/* ヘッダー */}
      <Title
        prev={{ url: `/shops/${shop._id}/staffs`, label: "スタッフ一覧に戻る" }}
        action={
          <Flex gap={2}>
            <Button
              onClick={() => {
                navigate({
                  to: "/shops/$shopId/staffs/$staffId/edit",
                  params: { shopId: shop._id, staffId: staff._id },
                });
              }}
              colorPalette="teal"
              gap={2}
            >
              <Icon as={LuPencil} boxSize={4} />
              <Text display={{ base: "none", md: "inline" }}>編集</Text>
            </Button>
            {staff.status === "pending" && (
              <Button colorPalette="orange" gap={2}>
                <Icon as={LuMail} boxSize={4} />
                <Text display={{ base: "none", md: "inline" }}>招待メールを再送</Text>
              </Button>
            )}
          </Flex>
        }
      >
        <Flex align="center" gap={4}>
          {/* アバター */}
          <Flex
            w={{ base: 16, md: 20 }}
            h={{ base: 16, md: 20 }}
            borderRadius="full"
            bgGradient="to-br"
            gradientFrom="teal.400"
            gradientTo="teal.600"
            align="center"
            justify="center"
            color="white"
            flexShrink={0}
          >
            <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="bold">
              {getInitials(staff.displayName)}
            </Text>
          </Flex>

          <Box>
            <Text as="h2" fontSize="xl" fontWeight="bold" color="gray.900" mb={1}>
              {staff.displayName}
            </Text>
          </Box>
        </Flex>
      </Title>

      {/* コンテンツ部分（共通コンポーネント使用） */}
      <Animation>
        <StaffDetailContent staff={staff} positions={positions} staffSkills={staffSkills} />
      </Animation>
    </Container>
  );
};

// ローディング状態
export const StaffDetailLoading = () => {
  return (
    <Container maxW="6xl" py={6}>
      <VStack align="stretch" gap={6}>
        <Skeleton height="40px" width="150px" />
        <Flex align="center" gap={4}>
          <Skeleton height="80px" width="80px" borderRadius="full" />
          <Box>
            <Skeleton height="32px" width="200px" mb={2} />
            <Skeleton height="20px" width="150px" />
          </Box>
        </Flex>
        <Grid gridTemplateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap={3}>
          <Skeleton height="80px" />
          <Skeleton height="80px" />
          <Skeleton height="80px" />
        </Grid>
        <Card.Root>
          <Card.Body>
            <VStack align="stretch" gap={4}>
              <SkeletonText noOfLines={1} />
              <SkeletonText noOfLines={1} />
              <SkeletonText noOfLines={1} />
            </VStack>
          </Card.Body>
        </Card.Root>
      </VStack>
    </Container>
  );
};

// 見つからない状態
type StaffDetailNotFoundProps = {
  shopId: string;
};

export const StaffDetailNotFound = ({ shopId }: StaffDetailNotFoundProps) => (
  <Container maxW="6xl" py={6}>
    <Empty
      icon={LuUser}
      title="スタッフが見つかりませんでした"
      action={
        <Link to="/shops/$shopId/staffs" params={{ shopId }}>
          <Button colorPalette="teal">スタッフ一覧に戻る</Button>
        </Link>
      }
    />
  </Container>
);
