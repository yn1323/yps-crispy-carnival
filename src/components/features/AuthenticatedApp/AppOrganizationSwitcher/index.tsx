import { Badge, HStack, Icon, Menu, Portal, Text } from "@chakra-ui/react";
import { LuBuilding2, LuCheck, LuChevronDown } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/components/ui/Button";

export type AppOrganizationSwitcherOption = {
  id: Id<"organizations">;
  name: string;
  memberStatus: "active" | "readOnly";
};

type Props = {
  activeOrganizationId: Id<"organizations">;
  activeOrganizationName: string;
  options: readonly AppOrganizationSwitcherOption[] | null;
  onSelect: (organizationId: Id<"organizations">) => void;
};

/** canonicalな所属組織一覧から、app全体の操作対象を切り替えるheader action。 */
export function AppOrganizationSwitcher({ activeOrganizationId, activeOrganizationName, options, onSelect }: Props) {
  if (!options || options.length <= 1) return null;

  return (
    <Menu.Root positioning={{ placement: "bottom-end", gutter: 8 }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`組織を切り替える（現在：${activeOrganizationName}）`}
          title={`現在の組織：${activeOrganizationName}`}
          minW={{ base: "44px", lg: "200px" }}
          w={{ base: "44px", lg: "auto" }}
          h="44px"
          maxW={{ lg: "200px" }}
          px={{ base: 0, lg: 3 }}
          gap={1.5}
          bg="white"
          borderColor="gray.300"
          color="gray.900"
          flexShrink={0}
          _hover={{ bg: "gray.50", borderColor: "gray.400" }}
        >
          <Icon as={LuBuilding2} boxSize={5} color="teal.700" flexShrink={0} aria-hidden />
          <Text
            as="span"
            display={{ base: "none", lg: "block" }}
            maxW={{ lg: "132px", xl: "180px" }}
            fontSize="sm"
            fontWeight="semibold"
            truncate
          >
            {activeOrganizationName}
          </Text>
          <Icon
            as={LuChevronDown}
            display={{ base: "none", lg: "block" }}
            boxSize={4}
            color="gray.500"
            flexShrink={0}
            aria-hidden
          />
        </Button>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(320px, calc(100vw - 24px))" maxH="min(520px, calc(100dvh - 96px))" overflowY="auto">
            <Menu.RadioItemGroup
              value={activeOrganizationId}
              onValueChange={({ value }) => {
                if (value === activeOrganizationId) return;
                const organization = options.find((option) => option.id === value);
                if (organization) onSelect(organization.id);
              }}
            >
              {options.map((option) => (
                <Menu.RadioItem key={option.id} value={option.id} cursor="pointer" ps={8} pe={3} py={2.5}>
                  <Menu.ItemIndicator color="teal.700">
                    <LuCheck aria-hidden />
                  </Menu.ItemIndicator>
                  <Menu.ItemText minW={0} w="full">
                    <HStack gap={2} minW={0} w="full">
                      <Text
                        as="span"
                        flex={1}
                        minW={0}
                        fontSize="sm"
                        fontWeight={option.id === activeOrganizationId ? "bold" : "medium"}
                        truncate
                      >
                        {option.name}
                      </Text>
                      {option.memberStatus === "readOnly" && (
                        <Badge colorPalette="gray" variant="subtle" size="sm" flexShrink={0}>
                          閲覧のみ
                        </Badge>
                      )}
                    </HStack>
                  </Menu.ItemText>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
