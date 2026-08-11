import { Box, Grid, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import { LuCrown, LuStore, LuUsers } from "react-icons/lu";
import type { OrganizationBillingView } from "./types";

export function OrganizationUsageSection({ billing }: { billing: OrganizationBillingView }) {
  if (billing.state === "migrationPending") return null;

  const appliedLimitLabel = getAppliedLimitLabel(billing);

  return (
    <Grid
      as="section"
      aria-label="組織の利用状況"
      templateColumns={{ base: "1fr", sm: "repeat(3, minmax(0, 1fr))" }}
      gap={{ base: 2, md: 4 }}
    >
      <UsageMeter
        icon={LuUsers}
        label="利用人数"
        current={billing.peopleUsage.current}
        max={billing.peopleUsage.max}
        helperText={usageHelperText(
          "管理者も1名として含みます",
          billing.peopleUsage.pendingInvitations,
          appliedLimitLabel,
        )}
      />
      <UsageMeter
        icon={LuStore}
        label="店舗数"
        current={billing.shopUsage.current}
        max={billing.shopUsage.max}
        helperText={appliedLimitLabel}
      />
      <UsageMeter
        icon={LuCrown}
        label="管理者数"
        current={billing.managerUsage.current}
        max={billing.managerUsage.max}
        helperText={usageHelperText(undefined, billing.managerUsage.pendingInvitations, appliedLimitLabel)}
      />
    </Grid>
  );
}

export function OrganizationUsageSectionSkeleton() {
  return (
    <Grid
      as="section"
      aria-label="組織の利用状況を読み込み中"
      templateColumns={{ base: "1fr", sm: "repeat(3, minmax(0, 1fr))" }}
      gap={{ base: 2, md: 4 }}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Box
          key={index}
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="xl"
          bg="white"
          p={{ base: 3, md: 4 }}
        >
          <Stack gap={3}>
            <HStack justify="space-between" gap={3}>
              <Skeleton h="20px" w="72px" />
              <Skeleton h="20px" w="48px" />
            </HStack>
            <Skeleton h="6px" w="full" borderRadius="full" />
            {index === 0 && <Skeleton h="18px" w="144px" maxW="90%" />}
          </Stack>
        </Box>
      ))}
    </Grid>
  );
}

const UsageMeter = ({
  icon: MeterIcon,
  label,
  current,
  max,
  helperText,
}: {
  icon: typeof LuUsers;
  label: string;
  current: number;
  max: number;
  helperText?: string;
}) => {
  const percentage = Math.min((current / Math.max(max, 1)) * 100, 100);
  const isExceeded = current > max;

  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 3, md: 4 }}>
      <HStack justify="space-between" gap={2} mb={2}>
        <HStack gap={2} color="gray.700" minW={0}>
          <Box flexShrink={0}>
            <MeterIcon aria-hidden />
          </Box>
          <Text fontSize={{ base: "xs", md: "sm" }} fontWeight="semibold" lineClamp={1}>
            {label}
          </Text>
        </HStack>
        <Text
          fontSize={{ base: "xs", md: "sm" }}
          fontWeight="bold"
          color={isExceeded ? "red.600" : "gray.900"}
          whiteSpace="nowrap"
          fontVariantNumeric="tabular-nums"
        >
          {current} / {max}
        </Text>
      </HStack>
      <Box
        role="meter"
        aria-label={`${label} ${current} / ${max}`}
        aria-valuemin={0}
        aria-valuemax={Math.max(max, 1)}
        aria-valuenow={Math.min(current, Math.max(max, 1))}
        aria-valuetext={isExceeded ? `${current} / ${max}、利用上限を超えています` : `${current} / ${max}`}
        h="6px"
        borderRadius="full"
        bg="gray.100"
        overflow="hidden"
      >
        <Box h="full" w={`${percentage}%`} bg={isExceeded ? "red.500" : "teal.500"} borderRadius="full" />
      </Box>
      {(helperText || isExceeded) && (
        <Text mt={2} fontSize="xs" color={isExceeded ? "red.700" : "fg.muted"}>
          {helperText ?? "利用上限を超えています"}
        </Text>
      )}
    </Box>
  );
};

function getAppliedLimitLabel(billing: OrganizationBillingView) {
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

function usageHelperText(base: string | undefined, pendingInvitations: number | undefined, limit: string | undefined) {
  const parts = [base];
  if (pendingInvitations && pendingInvitations > 0) parts.push(`招待中${pendingInvitations}名を含む`);
  if (limit) parts.push(limit);
  return parts.filter((part): part is string => Boolean(part)).join("。") || undefined;
}
