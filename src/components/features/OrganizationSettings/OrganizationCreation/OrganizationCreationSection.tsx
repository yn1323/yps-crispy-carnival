import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { LuPlus } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  canCreate: boolean;
  disabledReason?: string;
  onCreate: () => void;
};

export function OrganizationCreationSection({ canCreate, disabledReason, onCreate }: Props) {
  return (
    <Box
      as="section"
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
      p={{ base: 4, md: 5 }}
      aria-labelledby="organization-create-heading"
    >
      <Stack gap={4}>
        <Stack gap={1}>
          <Heading id="organization-create-heading" as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            新しい組織
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            別の会社やブランドの店舗を、現在の組織と分けて管理できます。
            <br />
            ユーザー、プラン、支払いは組織ごとに分かれます。
            <br />
            同じ会社で店舗を増やす場合は、「店舗」タブから追加してください。
          </Text>
        </Stack>

        <Stack gap={2} align="flex-end">
          <Button
            colorPalette="teal"
            disabled={!canCreate}
            title={!canCreate ? disabledReason : undefined}
            aria-describedby={!canCreate && disabledReason ? "organization-create-disabled-reason" : undefined}
            onClick={onCreate}
            gap={1.5}
          >
            <LuPlus aria-hidden />
            新しい組織を作る
          </Button>
          {!canCreate && disabledReason && (
            <Text id="organization-create-disabled-reason" fontSize="xs" color="orange.700" textAlign="right">
              {disabledReason}
            </Text>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
