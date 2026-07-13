import { Badge, Container, Heading, HStack, Link, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { PublicPageLayout } from "@/src/components/templates/PublicPageLayout";

export function ArticleSiteShell({ children }: { children: ReactNode }): ReactNode {
  return (
    <PublicPageLayout
      headerProps={{
        showLinks: false,
        showLogin: false,
        bg: "white",
        boxShadow: { base: "0 8px 20px rgba(15, 23, 42, 0.04)", md: "none" },
      }}
    >
      {children}
    </PublicPageLayout>
  );
}

export function ArticleBreadcrumbs({ items }: { items: { label: string; href?: string }[] }): ReactNode {
  return (
    <HStack as="nav" gap={2} color="gray.600" textStyle="sm" wrap="wrap">
      <Link href="/" color="gray.600" _hover={{ color: "teal.700", textDecoration: "none" }}>
        ホーム
      </Link>
      {items.map((item) => (
        <HStack key={`${item.href ?? item.label}-${item.label}`} gap={2}>
          <Text color="gray.400">/</Text>
          {item.href ? (
            <Link href={item.href} color="gray.600" _hover={{ color: "teal.700", textDecoration: "none" }}>
              {item.label}
            </Link>
          ) : (
            <Text color="gray.800" fontWeight="medium">
              {item.label}
            </Text>
          )}
        </HStack>
      ))}
    </HStack>
  );
}

export function ArticleNotFound({ title = "記事が見つかりません" }: { title?: string }): ReactNode {
  return (
    <ArticleSiteShell>
      <Container maxW="720px" px={{ base: 4, lg: 0 }} py={{ base: 16, lg: 24 }}>
        <VStack align="stretch" gap={4}>
          <Badge alignSelf="flex-start" colorPalette="orange" variant="subtle">
            Not found
          </Badge>
          <Heading as="h1" textStyle="pageTitle" color="gray.950">
            {title}
          </Heading>
          <Text color="gray.700" lineHeight="1.8">
            指定されたページは、現在の記事一覧に含まれていません。
          </Text>
        </VStack>
      </Container>
    </ArticleSiteShell>
  );
}
