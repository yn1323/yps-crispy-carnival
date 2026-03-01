import { Center, Heading, Icon, Spinner, Text, VStack } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { LuCalendarClock, LuCircleX, LuClock } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { ShiftSubmit } from "@/src/components/features/ShiftSubmit";
import { ConfirmedView } from "@/src/components/features/ShiftSubmit/ConfirmedView";

type ShiftSubmitPageProps = {
  token: string;
};

export const ShiftSubmitPage = ({ token }: ShiftSubmitPageProps) => {
  const data = useQuery(api.shiftRequest.queries.getSubmitPageData, token ? { token } : "skip");

  // トークンがない場合
  if (!token) {
    return (
      <ErrorState
        icon={LuCircleX}
        iconColor="red.500"
        title="リンクが確認できませんでした"
        description="URLを確認して、再度お試しください。"
      />
    );
  }

  // ローディング
  if (data === undefined) {
    return (
      <Center minH="100vh" bg="gray.50">
        <Spinner size="xl" />
      </Center>
    );
  }

  // エラー分岐
  if (data.error) {
    const errorConfig = {
      INVALID_TOKEN: {
        icon: LuCircleX,
        color: "red.500",
        title: "リンクが確認できませんでした",
        desc: "URLを確認して、再度お試しください。",
      },
      TOKEN_EXPIRED: {
        icon: LuClock,
        color: "orange.500",
        title: "リンクの有効期限が切れています",
        desc: "受付期間が終了したため、このリンクは使えません。",
      },
      SHOP_NOT_FOUND: {
        icon: LuCircleX,
        color: "red.500",
        title: "店舗情報を取得できませんでした",
        desc: "時間をおいて再度お試しください。",
      },
      NO_OPEN_RECRUITMENT: {
        icon: LuCalendarClock,
        color: "orange.500",
        title: "現在は募集を受け付けていません",
        desc: "現在この店舗で受付中の募集はありません。",
      },
      RECRUITMENT_CLOSED: {
        icon: LuCalendarClock,
        color: "orange.500",
        title: "募集は締め切りました",
        desc: "シフトが確定するまでお待ちください。",
      },
    } as const;

    const config = errorConfig[data.error];
    return <ErrorState icon={config.icon} iconColor={config.color} title={config.title} description={config.desc} />;
  }

  // 確定シフト閲覧
  if (data.status === "confirmed") {
    return (
      <ConfirmedView
        staff={data.staff}
        shop={data.shop}
        recruitment={data.recruitment}
        positions={data.positions}
        staffs={data.staffs}
        shiftRequests={data.shiftRequests}
        shiftAssignment={data.shiftAssignment}
      />
    );
  }

  // シフト希望提出フォーム
  return (
    <ShiftSubmit
      token={token}
      staff={data.staff}
      shop={data.shop}
      recruitment={data.recruitment}
      existingRequest={data.existingRequest}
      previousRequest={data.previousRequest}
      frequentTimePatterns={data.frequentTimePatterns}
    />
  );
};

type ErrorStateProps = {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
};

const ErrorState = ({ icon, iconColor, title, description }: ErrorStateProps) => (
  <Center minH="100vh" bg="gray.50" p={4}>
    <VStack gap={6}>
      <Center>
        <Center bg="gray.100" p={4} borderRadius="full">
          <Icon as={icon} boxSize={8} color={iconColor} />
        </Center>
      </Center>
      <VStack gap={2}>
        <Heading size="lg" textAlign="center">
          {title}
        </Heading>
        <Text color="gray.600" textAlign="center">
          {description}
        </Text>
      </VStack>
    </VStack>
  </Center>
);
