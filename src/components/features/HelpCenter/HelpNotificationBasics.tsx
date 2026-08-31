import { Box, Container, Flex, Heading, HStack, Image, Link, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuArrowRight, LuMail } from "react-icons/lu";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";
import staffRegistrationNotificationsImage from "./content/images/notification-scenarios/shiftori_01_staff_registration_notifications.webp";
import shiftNotificationsImage from "./content/images/notification-scenarios/shiftori_02_shift_notifications.webp";
import managerInvitationNotificationsImage from "./content/images/notification-scenarios/shiftori_03_manager_invitation_notifications.webp";
import { HelpAudienceBadge } from "./HelpAudienceBadge";
import { HelpSupport } from "./HelpSupport";
import { NOTIFICATION_BASICS_HELP } from "./notificationBasicsHelp";

const NOTIFICATION_IMAGE_WIDTH = 1448;
const NOTIFICATION_IMAGE_HEIGHT = 1086;

export function HelpNotificationBasics() {
  return (
    <PublicPageLayout>
      <Box borderBottomWidth="1px" borderColor="gray.200" bg="gray.50/60">
        <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 7, lg: 10 }}>
          <Stack gap={5} maxW="860px">
            <HelpBreadcrumbs />
            <Stack gap={3} align="flex-start">
              <Flex gap={2} wrap="wrap">
                {NOTIFICATION_BASICS_HELP.audiences.map((audience) => (
                  <HelpAudienceBadge key={audience} audience={audience} />
                ))}
              </Flex>
              <Heading
                id="help-notification-basics-title"
                as="h1"
                color="gray.950"
                fontSize={{ base: "2xl", lg: "3xl" }}
                lineHeight="1.4"
                letterSpacing="0"
                textWrap="balance"
              >
                {NOTIFICATION_BASICS_HELP.title}
              </Heading>
              <Text color="gray.700" lineHeight="1.8">
                {NOTIFICATION_BASICS_HELP.description}
              </Text>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxW="6xl" px={{ base: 4, lg: 8 }} py={{ base: 8, lg: 14 }}>
        <Stack
          as="article"
          aria-labelledby="help-notification-basics-title"
          maxW="1040px"
          mx="auto"
          gap={{ base: 10, lg: 14 }}
        >
          <NotificationFlowFigures />
          <BillingNotifications />
          <RelatedHelp />
          <HelpSupport />
        </Stack>
      </Container>
    </PublicPageLayout>
  );
}

function NotificationFlowFigures() {
  return (
    <Stack as="section" aria-labelledby="notification-flow-title" gap={8}>
      <Stack gap={2}>
        <Heading id="notification-flow-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
          業務フローで見る通知タイミング
        </Heading>
      </Stack>
      <NotificationFigure
        headingId="staff-registration-notifications-title"
        src={staffRegistrationNotificationsImage}
        accessibleDescription="管理者がスタッフを登録すると、LINE未連携の場合はLINE連携案内を送り、受付中のシフト募集がある場合は希望シフトの提出を依頼します。スタッフ本人が登録を申請した場合は、承認待ちの申請があると毎日17時に対象店舗の管理者へお知らせします。管理者が承認すると、LINE連携案内と受付中のシフト募集の提出依頼を必要な場合に送ります。LINE連携後に受付中のシフト募集があれば、LINEで提出を依頼します。"
        caption="スタッフ追加方法で通知タイミングが少し異なります。"
        expandLabel="スタッフ登録と通知の流れ"
      />
      <NotificationFigure
        headingId="shift-notifications-title"
        src={shiftNotificationsImage}
        accessibleDescription="シフト募集を作成すると、シフト対象スタッフへ希望シフトの提出を依頼します。提出期限の前日17時には未提出スタッフへ催促し、提出期限の翌日17時にシフトが未確定なら対象店舗の管理者へ確定を催促します。シフト確定時はスタッフへ確定シフトを通知します。確定後にシフトを変更した場合は、変更があるスタッフまたは前回通知できなかったスタッフへ変更内容を通知します。"
        caption={"提出期限前催促、確定時の通知があります。\nまた、管理者へのリマインダーもあります。"}
        expandLabel="シフト募集から確定・変更までの通知"
      />
      <NotificationFigure
        headingId="manager-invitation-notifications-title"
        src={managerInvitationNotificationsImage}
        accessibleDescription="管理者を招待または再送すると、招待された管理者へ案内メールを送ります。招待が承認されると、承認した管理者とほかの有効な管理者へ承認完了メールを送ります。"
        expandLabel="管理者招待と通知の流れ"
      />
    </Stack>
  );
}

function NotificationFigure({
  headingId,
  src,
  accessibleDescription,
  caption,
  expandLabel,
}: {
  headingId: string;
  src: string;
  accessibleDescription: string;
  caption?: string;
  expandLabel: string;
}) {
  const descriptionId = `${headingId}-description`;

  return (
    <Box as="figure" m={0} aria-labelledby={headingId} aria-describedby={descriptionId}>
      <VisuallyHidden as="h3" id={headingId}>
        {expandLabel}
      </VisuallyHidden>
      <VisuallyHidden as="p" id={descriptionId}>
        {accessibleDescription}
      </VisuallyHidden>
      <Box
        overflow="hidden"
        w="full"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="xl"
        bg="white"
        aspectRatio={NOTIFICATION_IMAGE_WIDTH / NOTIFICATION_IMAGE_HEIGHT}
      >
        <Image
          src={src}
          alt=""
          width={NOTIFICATION_IMAGE_WIDTH}
          height={NOTIFICATION_IMAGE_HEIGHT}
          loading="lazy"
          decoding="async"
          w="full"
          h="full"
          objectFit="contain"
        />
      </Box>
      <Stack as="figcaption" mt={3} gap={2} align="flex-start">
        {caption ? (
          <Text color="gray.700" fontSize="sm" lineHeight="1.8" whiteSpace="pre-line">
            {caption}
          </Text>
        ) : null}
        <Link
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          display={{ base: "inline-flex", lg: "none" }}
          alignItems="center"
          gap={1}
          color="teal.700"
          fontSize="sm"
          fontWeight="bold"
          aria-label={`${expandLabel}の画像を拡大して新しいタブで見る`}
        >
          画像を拡大して見る
          <LuArrowRight aria-hidden />
        </Link>
      </Stack>
    </Box>
  );
}

function HelpBreadcrumbs() {
  return (
    <HStack as="nav" aria-label="パンくず" gap={2} wrap="wrap" color="gray.600" fontSize="sm">
      <Link href="/help" color="teal.700" fontWeight="semibold">
        ヘルプ・使い方
      </Link>
      <Text aria-hidden>/</Text>
      <Text color="gray.700" lineClamp={1}>
        {NOTIFICATION_BASICS_HELP.title}
      </Text>
    </HStack>
  );
}

function BillingNotifications() {
  return (
    <Stack as="section" aria-labelledby="billing-notifications-title" gap={6}>
      <Heading id="billing-notifications-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
        料金・プランに関する通知
      </Heading>
      <Stack gap={3} p={{ base: 5, md: 6 }} borderWidth="1px" borderColor="gray.200" borderRadius="xl">
        <Flex align="center" gap={3}>
          <Flex align="center" justify="center" boxSize={10} borderRadius="lg" bg="teal.50">
            <LuMail aria-hidden color="var(--chakra-colors-teal-800)" />
          </Flex>
          <Heading as="h3" color="gray.950" fontSize="md">
            Stripeから届くメール
          </Heading>
        </Flex>
        <Text color="gray.700" fontSize="sm" lineHeight="1.8">
          請求書、領収書などの決済関連メールは、組織の請求通知先メールアドレスへ送られます。
        </Text>
      </Stack>
    </Stack>
  );
}

function RelatedHelp() {
  return (
    <Stack as="section" aria-labelledby="notification-related-help-title" gap={4}>
      <Heading id="notification-related-help-title" as="h2" color="gray.950" fontSize={{ base: "xl", lg: "2xl" }}>
        関連情報
      </Heading>
      <Stack gap={3}>
        <RelatedHelpLink
          href="/help/check-notification-history"
          title="個別スタッフへの通知履歴を確認する"
          description="メールまたはLINEで送った通知の日時、目的、状況を確認します。"
        />
        <RelatedHelpLink
          href="/help/guide-staff-line-connection"
          title="スタッフへLINE連携を案内する"
          description="スタッフ詳細から連携用のURLやQRコードを表示し、案内メールを送ります。"
        />
        <RelatedHelpLink
          href="/help/tasks/notifications#notification-not-received"
          title="メール通知が届かないときの確認項目を見る"
          description="メールアドレス、受信設定、送れなかった通知の確認方法を案内します。"
        />
      </Stack>
    </Stack>
  );
}

function RelatedHelpLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={4}
      minH="88px"
      px={{ base: 4, md: 5 }}
      py={4}
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      color="gray.950"
      bg="white"
      textDecoration="none"
      _hover={{ borderColor: "gray.400", bg: "gray.50", textDecoration: "none" }}
      _active={{ bg: "gray.100" }}
      _focusVisible={{ borderColor: "teal.600", boxShadow: "0 0 0 2px var(--chakra-colors-teal-600)" }}
    >
      <Stack gap={1}>
        <Text fontWeight="bold">{title}</Text>
        <Text color="gray.600" fontSize="sm" lineHeight="1.7">
          {description}
        </Text>
      </Stack>
      <LuArrowRight aria-hidden color="var(--chakra-colors-teal-700)" />
    </Link>
  );
}
