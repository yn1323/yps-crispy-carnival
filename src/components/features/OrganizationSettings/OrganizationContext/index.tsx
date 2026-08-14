import { Box, HStack, Icon, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { LuBuilding2, LuCheck, LuChevronDown, LuSettings } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import type { OrganizationContextModel } from "./script";

type Props = {
  model: OrganizationContextModel;
  canUpdateOrganizationName: boolean;
  updateOrganizationNameDisabledReason?: string;
  onBackToDashboard: () => void;
  onSelectOrganization: (shopId: string) => void;
  onUpdateOrganizationName: () => void;
};

export function OrganizationContext({
  model,
  canUpdateOrganizationName,
  updateOrganizationNameDisabledReason,
  onBackToDashboard,
  onSelectOrganization,
  onUpdateOrganizationName,
}: Props) {
  return (
    <Stack gap={2}>
      <DetailPageHeader
        title={model.selectedOrganizationName}
        icon={LuBuilding2}
        onBack={onBackToDashboard}
        backAriaLabel={`${model.selectedOrganizationName}のダッシュボードへ戻る`}
        action={
          <IconButton
            aria-label="組織名を変更"
            size="sm"
            variant="ghost"
            colorPalette="teal"
            minW="44px"
            minH="44px"
            flexShrink={0}
            onClick={onUpdateOrganizationName}
            disabled={!canUpdateOrganizationName}
            title={!canUpdateOrganizationName ? updateOrganizationNameDisabledReason : undefined}
            aria-describedby={
              !canUpdateOrganizationName && updateOrganizationNameDisabledReason
                ? "organization-name-update-disabled-reason"
                : undefined
            }
          >
            <LuSettings aria-hidden />
          </IconButton>
        }
      />

      {model.canSwitchOrganization && <OrganizationSelector model={model} onSelect={onSelectOrganization} />}

      {!canUpdateOrganizationName && updateOrganizationNameDisabledReason && (
        <Text id="organization-name-update-disabled-reason" fontSize="xs" color="orange.700">
          {updateOrganizationNameDisabledReason}
        </Text>
      )}
    </Stack>
  );
}

function OrganizationSelector({
  model,
  onSelect,
}: {
  model: OrganizationContextModel;
  onSelect: (shopId: string) => void;
}) {
  return (
    <Box display="flex" justifyContent="flex-end" minW={0}>
      <Menu.Root positioning={{ placement: "bottom-end", gutter: 8 }}>
        <Menu.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`組織を切り替える（現在：${model.selectedOrganizationName}）`}
            gap={1.5}
            minH="36px"
            h="auto"
            px={2.5}
            py={1.5}
            borderColor="gray.300"
            borderRadius="md"
            color="gray.900"
            cursor="pointer"
            _hover={{ bg: "gray.50", borderColor: "gray.400" }}
          >
            <Text fontSize="xs" fontWeight="medium" whiteSpace="nowrap">
              組織を切り替える
            </Text>
            <Icon as={LuChevronDown} boxSize={4} color="gray.500" flexShrink={0} />
          </Button>
        </Menu.Trigger>

        <Portal>
          <Menu.Positioner>
            <Menu.Content w="min(340px, calc(100vw - 24px))" maxH="min(520px, calc(100dvh - 96px))" overflowY="auto">
              {model.options.map((option) => (
                <Menu.Item
                  key={option.key}
                  value={`organization-${option.key}`}
                  aria-current={option.isSelected ? "true" : undefined}
                  cursor="pointer"
                  px={3}
                  py={2.5}
                  onClick={() => onSelect(option.shopId)}
                >
                  <HStack w="full" gap={2.5} minW={0}>
                    <Box w="18px" color="teal.600" flexShrink={0}>
                      {option.isSelected && <LuCheck aria-hidden />}
                    </Box>
                    <Text fontSize="sm" fontWeight={option.isSelected ? "bold" : "medium"} truncate minW={0}>
                      {option.organizationName}
                    </Text>
                  </HStack>
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Box>
  );
}
