import { Box, Flex, HStack, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { LuChevronRight, LuMegaphone } from "react-icons/lu";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import type { DashboardAnnouncement as DashboardAnnouncementData } from "../types";
import { sanitizeDashboardAnnouncementHtml } from "./sanitizeAnnouncementHtml";

type Props = {
  announcement: DashboardAnnouncementData;
  defaultOpen?: boolean;
};

export const DashboardAnnouncement = ({ announcement, defaultOpen = false }: Props) => {
  const dialog = useDialog(defaultOpen);
  const displayDate = formatDateWithWeekday(announcement.displayDate);
  const sanitizedBodyHtml = useMemo(
    () => sanitizeDashboardAnnouncementHtml(announcement.bodyHtml),
    [announcement.bodyHtml],
  );

  return (
    <>
      <Flex
        as="button"
        w="full"
        align="center"
        justify="space-between"
        gap={3}
        borderWidth="1px"
        borderColor="orange.200"
        borderRadius="lg"
        bg="orange.50/30"
        px={{ base: 3.5, md: 4 }}
        py={{ base: 2.5, md: 3 }}
        textAlign="left"
        transition="background-color 0.15s ease, border-color 0.15s ease"
        _hover={{ bg: "orange.50", borderColor: "orange.300" }}
        _focusVisible={{ outline: "2px solid", outlineColor: "teal.500", outlineOffset: "2px" }}
        onClick={dialog.open}
        aria-label={`${displayDate} ${announcement.title}を開く`}
      >
        <HStack gap={3} minW={0} flex={1}>
          <Box color="orange.600" fontSize="lg" flexShrink={0}>
            <LuMegaphone />
          </Box>
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted" flexShrink={0}>
            {displayDate}
          </Text>
          <Text fontSize="sm" fontWeight="semibold" color="gray.900" truncate minW={0}>
            {announcement.title}
          </Text>
        </HStack>
        <Box color="fg.muted" flexShrink={0}>
          <LuChevronRight />
        </Box>
      </Flex>

      <Dialog
        title={announcement.title}
        isOpen={dialog.isOpen}
        onOpenChange={dialog.onOpenChange}
        onClose={dialog.close}
        closeLabel="閉じる"
        maxW={{ base: "100vw", md: "640px" }}
        maxH={{ base: "100dvh", md: "85dvh" }}
        contentProps={{
          w: "100%",
          h: { base: "100dvh", md: "auto" },
          my: { base: 0, md: "auto" },
          borderRadius: { base: 0, md: "l3" },
        }}
      >
        <Text fontSize="xs" color="fg.muted" mb={4}>
          {displayDate}
        </Text>
        <Box
          fontSize="sm"
          lineHeight="tall"
          color="gray.800"
          css={{
            "& p": { margin: "0 0 12px" },
            "& p:last-child": { marginBottom: 0 },
            "& ul, & ol": { margin: "0 0 12px", paddingInlineStart: "1.25rem" },
            "& li": { margin: "0 0 4px" },
            "& a": { color: "teal.700", textDecoration: "underline", textUnderlineOffset: "2px" },
            "& strong, & b": { fontWeight: "700" },
          }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: DB入稿HTMLはDOMPurifyで許可タグだけにsanitizeしてから表示する
          dangerouslySetInnerHTML={{ __html: sanitizedBodyHtml }}
        />
      </Dialog>
    </>
  );
};
