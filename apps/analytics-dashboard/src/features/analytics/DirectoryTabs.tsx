import { HStack, Link } from "@chakra-ui/react";

const TABS = [
  { key: "organizations", label: "組織", href: "/organizations" },
  { key: "shops", label: "店舗", href: "/shops" },
] as const;

/** 組織一覧と店舗一覧を切り替える。絞り込みはタブごとに持ち、切り替えると解除する。 */
export function DirectoryTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <HStack as="nav" aria-label="一覧の切り替え" gap={0} borderBottom="1px solid" borderColor="gray.200">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            mb="-1px"
            px={5}
            py={2.5}
            fontSize="sm"
            fontWeight="bold"
            color={isActive ? "gray.950" : "gray.600"}
            borderBottom="2px solid"
            borderColor={isActive ? "gray.950" : "transparent"}
            textDecoration="none"
            _hover={{ color: "gray.950", textDecoration: "none" }}
          >
            {tab.label}
          </Link>
        );
      })}
    </HStack>
  );
}
