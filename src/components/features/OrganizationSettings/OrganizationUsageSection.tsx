import { Box, Flex, Grid, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import { LuStore, LuUserRoundCog, LuUsers } from "react-icons/lu";
import type { OrganizationBillingView } from "./types";

export type OrganizationUsageSummary = Pick<
  OrganizationBillingView,
  "state" | "currentPlan" | "limitPlan" | "peopleUsage" | "shopUsage" | "managerUsage"
>;

export function OrganizationUsageSection({ billing }: { billing: OrganizationUsageSummary }) {
  if (billing.state === "migrationPending") return null;

  if (billing.state === "restricted" && billing.limitPlan === undefined) {
    return (
      <Box
        as="section"
        aria-label="組織の利用状況"
        borderWidth="1px"
        borderColor="blackAlpha.100"
        borderRadius="xl"
        bg="white"
        px={{ base: 3, md: 4 }}
        py={{ base: 3, md: 4 }}
      >
        <Text fontSize="sm" fontWeight="semibold" color="gray.800">
          利用停止中はプラン上限を適用していません
        </Text>
        <Text mt={1} fontSize="xs" color="fg.muted">
          データは保持されています。ProまたはBusinessを契約すると利用を再開できます。
        </Text>
      </Box>
    );
  }

  const appliedLimitLabel = getAppliedLimitLabel(billing);
  const notes = [appliedLimitLabel].filter((note): note is string => Boolean(note));

  return (
    <Box
      as="section"
      aria-label="組織の利用状況"
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
      overflow="hidden"
    >
      <Grid
        templateColumns={{
          base: "minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)",
        }}
        gap={0}
      >
        <UsageMeter
          icon={LuUsers}
          label="利用人数"
          current={billing.peopleUsage.current}
          max={billing.peopleUsage.max}
        />
        <UsageDivider />
        <UsageMeter icon={LuStore} label="店舗数" current={billing.shopUsage.current} max={billing.shopUsage.max} />
        <UsageDivider />
        <UsageMeter
          icon={LuUserRoundCog}
          label="管理者数"
          current={billing.managerUsage.current}
          max={billing.managerUsage.max}
        />
      </Grid>
      {notes.length > 0 && (
        <Text
          borderTopWidth="1px"
          borderColor="blackAlpha.100"
          px={2}
          py={1.5}
          fontSize="xs"
          lineHeight="short"
          textAlign={{ base: "center", sm: "start" }}
          color="fg.muted"
        >
          {notes.join("。")}
        </Text>
      )}
    </Box>
  );
}

export function OrganizationUsageSectionSkeleton() {
  return (
    <Box
      as="section"
      aria-label="組織の利用状況を読み込み中"
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
      overflow="hidden"
    >
      <Grid
        templateColumns={{
          base: "minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)",
        }}
        gap={0}
      >
        {Array.from({ length: 3 }, (_, index) => (
          <Box key={index} display="contents">
            {index > 0 && <UsageDivider />}
            <Flex
              direction="column"
              justify="flex-start"
              align="center"
              gap={1}
              minW={0}
              bg="white"
              px={{ base: 1, sm: 3, md: 4 }}
              py={{ base: 2, sm: 3, md: 3 }}
            >
              <HStack gap={{ base: 1, sm: 2 }}>
                <Skeleton boxSize="16px" borderRadius="full" />
                <Skeleton h="18px" w="48px" />
              </HStack>
              <Skeleton h="20px" w="44px" />
            </Flex>
          </Box>
        ))}
      </Grid>
    </Box>
  );
}

const UsageMeter = ({
  icon: MeterIcon,
  label,
  current,
  max,
}: {
  icon: typeof LuUsers;
  label: string;
  current: number;
  max: number;
}) => {
  const isExceeded = current > max;

  return (
    <Stack gap={isExceeded ? 1 : 0} minW={0} bg="white" px={{ base: 1, sm: 3, md: 4 }} py={{ base: 2, sm: 3, md: 3 }}>
      <Flex direction="column" justify="flex-start" align="center" gap={1} minW={0}>
        <HStack gap={2} color="gray.700" minW={0}>
          <Box flexShrink={0}>
            <MeterIcon aria-hidden />
          </Box>
          <Text textStyle="sm" fontWeight="semibold" lineClamp={1}>
            {label}
          </Text>
        </HStack>
        <Text
          textStyle="sm"
          fontWeight="bold"
          color={isExceeded ? "red.600" : "gray.900"}
          whiteSpace="nowrap"
          fontVariantNumeric="tabular-nums"
          role="meter"
          aria-label={`${label} ${current} / ${max}`}
          aria-valuemin={0}
          aria-valuemax={Math.max(max, 1)}
          aria-valuenow={Math.min(current, Math.max(max, 1))}
          aria-valuetext={isExceeded ? `${current} / ${max}、利用上限を超えています` : `${current} / ${max}`}
        >
          {current} / {max}
        </Text>
      </Flex>
      {isExceeded && (
        <Text fontSize="xs" lineHeight="short" textAlign={{ base: "center", sm: "start" }} color="red.700">
          上限超過
        </Text>
      )}
    </Stack>
  );
};

function UsageDivider() {
  return <Box aria-hidden alignSelf="stretch" w="1px" my={2} bg="blackAlpha.100" />;
}

function getAppliedLimitLabel(billing: OrganizationUsageSummary) {
  if (billing.state === "restricted") {
    return billing.limitPlan === "pro"
      ? "現在はProの上限が適用されています"
      : billing.limitPlan === "free"
        ? "現在はFreeの上限が適用されています"
        : undefined;
  }

  return billing.state === "pendingActivation" && billing.currentPlan === null
    ? "現在はFreeの上限が適用されています"
    : undefined;
}
