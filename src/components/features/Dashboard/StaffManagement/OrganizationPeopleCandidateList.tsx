import { Alert, Badge, Box, Flex, HStack, Skeleton, Spinner, Stack, Text } from "@chakra-ui/react";
import { Component, type ReactNode } from "react";
import { LuUserPlus, LuUsers } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { useShopQuery } from "@/src/hooks/useShopQuery";

export type OrganizationPersonCandidate = {
  personId: Id<"organizationPeople">;
  name: string;
  email: string;
  shopNames: string[];
  isManager: boolean;
};

type CandidateListProps = {
  enabled: boolean;
  isReadOnly?: boolean;
  addingPersonId: Id<"organizationPeople"> | null;
  isAdding: boolean;
  onAdd: (personId: Id<"organizationPeople">) => void | Promise<void>;
};

export function OrganizationPeopleCandidateList({ enabled, ...props }: CandidateListProps) {
  if (!enabled) return null;

  return (
    <CandidateQueryErrorBoundary
      fallback={
        <OrganizationPeopleCandidateListView
          candidates={[]}
          errorMessage="モーダルを閉じて、もう一度お試しください。"
          {...props}
        />
      }
    >
      <ConnectedCandidateList {...props} />
    </CandidateQueryErrorBoundary>
  );
}

function ConnectedCandidateList(props: Omit<CandidateListProps, "enabled">) {
  const candidates = useShopQuery(api.staff.queries.listOrganizationPeopleAvailableForShop, {});

  return (
    <OrganizationPeopleCandidateListView
      candidates={candidates ?? []}
      isLoading={candidates === undefined}
      errorMessage={
        candidates === null ? "グループ設定の「ユーザー」で登録内容を確認してから、もう一度お試しください。" : undefined
      }
      {...props}
    />
  );
}

type CandidateListViewProps = Omit<CandidateListProps, "enabled"> & {
  candidates: OrganizationPersonCandidate[];
  isLoading?: boolean;
  errorMessage?: string;
};

export function OrganizationPeopleCandidateListView({
  candidates,
  isLoading = false,
  errorMessage,
  isReadOnly = false,
  addingPersonId,
  isAdding,
  onAdd,
}: CandidateListViewProps) {
  if (errorMessage) {
    return (
      <Alert.Root status="error">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>スタッフ候補を読み込めませんでした</Alert.Title>
          <Alert.Description whiteSpace="pre-line">{errorMessage}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  if (isLoading) return <CandidateListSkeleton />;

  if (candidates.length === 0) {
    return <Empty icon={LuUsers} title="追加できるスタッフはいません" tone="brand" variant="section" />;
  }

  return (
    <Stack gap={4}>
      <Text fontSize="sm" color="fg.muted" lineHeight="tall">
        同じグループに所属し、この店舗にはまだ登録されていないスタッフです。
        <br />
        追加するスタッフを押してください。
      </Text>
      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" boxShadow="xs" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          {candidates.map((candidate) => {
            const isCurrent = candidate.personId === addingPersonId;
            const initial = candidate.name.trim().charAt(0) || "?";
            const shopsLabel =
              candidate.shopNames.length > 0 ? `所属店舗: ${candidate.shopNames.join("、")}` : "所属店舗なし";

            return (
              <Button
                key={candidate.personId}
                variant="plain"
                type="button"
                aria-label={isCurrent ? `${candidate.name}を追加中` : `${candidate.name}をこの店舗に追加`}
                aria-busy={isCurrent || undefined}
                gap={3}
                px={{ base: 3, lg: 4 }}
                py={3.5}
                alignItems="center"
                w="full"
                minH="72px"
                h="auto"
                justifyContent="flex-start"
                textAlign="left"
                whiteSpace="normal"
                bg={candidate.isManager ? "gray.50" : "transparent"}
                borderWidth={0}
                borderRadius={0}
                cursor={isReadOnly || isAdding ? "not-allowed" : "pointer"}
                opacity={isAdding && !isCurrent ? 0.6 : 1}
                transition="background-color 150ms ease, opacity 150ms ease"
                _hover={isReadOnly || isAdding ? undefined : { bg: candidate.isManager ? "gray.100" : "blackAlpha.50" }}
                _focusVisible={{
                  outlineWidth: "2px",
                  outlineStyle: "solid",
                  outlineColor: "teal.500",
                  outlineOffset: "-2px",
                }}
                disabled={isReadOnly || isAdding}
                onClick={() => onAdd(candidate.personId)}
              >
                <Flex
                  boxSize="40px"
                  borderRadius="full"
                  bg={candidate.isManager ? "teal.500" : "teal.50"}
                  color={candidate.isManager ? "white" : "teal.700"}
                  align="center"
                  justify="center"
                  fontWeight="semibold"
                  fontSize="sm"
                  flexShrink={0}
                  letterSpacing="0.02em"
                >
                  {initial}
                </Flex>
                <Stack gap={0.5} flex={1} minW={0}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text fontWeight={500} color="gray.900" truncate>
                      {candidate.name}
                    </Text>
                    {candidate.isManager && (
                      <Badge
                        colorPalette="teal"
                        variant="subtle"
                        bg="teal.100"
                        borderRadius="full"
                        px={2}
                        textStyle="2xs"
                      >
                        管理者
                      </Badge>
                    )}
                  </HStack>
                  <Text fontSize="xs" color="fg.muted" truncate>
                    {candidate.email}
                  </Text>
                  <Text fontSize="xs" color="fg.subtle" truncate>
                    {shopsLabel}
                  </Text>
                </Stack>
                <Flex color="teal.600" fontSize="lg" flexShrink={0} aria-hidden>
                  {isCurrent ? <Spinner size="sm" /> : <LuUserPlus />}
                </Flex>
              </Button>
            );
          })}
        </Stack>
      </Box>
    </Stack>
  );
}

function CandidateListSkeleton() {
  return (
    <Stack gap={4} aria-label="他店舗スタッフを読み込み中" aria-busy="true">
      <Stack gap={2}>
        <Skeleton h="16px" w="96%" />
        <Skeleton h="16px" w="72%" />
      </Stack>
      <Box borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          {Array.from({ length: 3 }).map((_, index) => (
            <HStack key={index} gap={3} px={{ base: 3, lg: 4 }} py={3.5} minH="72px">
              <Skeleton boxSize="40px" borderRadius="full" flexShrink={0} />
              <Stack gap={2} flex={1}>
                <Skeleton h="18px" w="112px" />
                <Skeleton h="14px" w="184px" />
              </Stack>
              <Skeleton boxSize="20px" borderRadius="sm" />
            </HStack>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

class CandidateQueryErrorBoundary extends Component<ErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
