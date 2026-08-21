import { Badge, Box, Flex, List, Stack, Text, VisuallyHidden } from "@chakra-ui/react";

type Props = {
  id?: string;
  heading: string;
  description?: string;
  badgeLabel: string;
  statusMessage?: string;
};

/** 店舗所属を外すときに、2つの管理画面で共通する影響だけを表示する。 */
export function MembershipRemovalImpact({ id, heading, description, badgeLabel, statusMessage }: Props) {
  return (
    <Stack gap={1.5}>
      <Flex align="center" gap={2} wrap="wrap">
        <Text fontWeight="medium" color="gray.900" lineHeight="short" overflowWrap="anywhere">
          {heading}
        </Text>
        <Badge colorPalette="red" variant="outline" borderRadius="md" px={2} py={0.5}>
          {badgeLabel}
        </Badge>
      </Flex>
      {description && (
        <Text fontSize="xs" color="fg.subtle" overflowWrap="anywhere">
          {description}
        </Text>
      )}
      <Box id={id}>
        {id && <VisuallyHidden>{badgeLabel}。</VisuallyHidden>}
        <List.Root as="ul" gap={1} ps={5} color="red.700" fontSize="sm" lineHeight="tall">
          <List.Item>シフト割り当てから削除</List.Item>
          <List.Item>シフト通知は届かなくなります</List.Item>
        </List.Root>
      </Box>
      {statusMessage && (
        <Text fontSize="xs" color="fg.muted" role="status">
          {statusMessage}
        </Text>
      )}
    </Stack>
  );
}
