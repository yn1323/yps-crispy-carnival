import { Box, Flex, Heading, HStack, Icon, Menu, Portal, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { LuArrowLeft, LuCheck, LuChevronDown, LuSettings } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import type { OrganizationContextModel } from "./script";

type Props = {
  model: OrganizationContextModel;
  canUpdateOrganizationName: boolean;
  updateOrganizationNameDisabledReason?: string;
  onSelectOrganization: (shopId: string) => void;
  onUpdateOrganizationName: () => void;
};

export function OrganizationContext({
  model,
  canUpdateOrganizationName,
  updateOrganizationNameDisabledReason,
  onSelectOrganization,
  onUpdateOrganizationName,
}: Props) {
  return (
    <Stack gap={2}>
      <Button asChild variant="plain" size="sm" alignSelf="flex-start" px={0} colorPalette="teal">
        <RouterLink to="/dashboard" search={{ shop: model.selectedShopId }}>
          <LuArrowLeft aria-hidden />
          {model.selectedShopName}に戻る
        </RouterLink>
      </Button>

      <Flex align="center" justify="space-between" gap={3} minW={0}>
        <OrganizationSelector model={model} onSelect={onSelectOrganization} />
        <IconButton
          aria-label="グループ名を変更"
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
      </Flex>

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
  if (!model.canSwitchOrganization) {
    return (
      <Heading as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900" truncate minW={0}>
        {model.selectedOrganizationName}
      </Heading>
    );
  }

  return (
    <Box flex={1} minW={0}>
      <VisuallyHidden as="h1">{model.selectedOrganizationName}</VisuallyHidden>
      <Menu.Root positioning={{ placement: "bottom-start", gutter: 8 }}>
        <Menu.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`グループを切り替える。現在は${model.selectedOrganizationName}`}
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            gap={3}
            w="full"
            minW={0}
            minH={{ base: "48px", md: "56px" }}
            h="auto"
            px={{ base: 3, md: 4 }}
            py={2.5}
            borderColor="gray.300"
            borderRadius="lg"
            color="gray.900"
            cursor="pointer"
            _hover={{ bg: "gray.50", borderColor: "gray.400" }}
          >
            <Text textStyle={{ base: "sectionTitle", md: "pageTitle" }} fontWeight="bold" truncate minW={0}>
              {model.selectedOrganizationName}
            </Text>
            <Icon as={LuChevronDown} boxSize={5} color="gray.500" flexShrink={0} />
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
