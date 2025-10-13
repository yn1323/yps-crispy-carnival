import { Box, Breadcrumb, Flex, Heading, IconButton, Stack } from "@chakra-ui/react";
import { type FileRouteTypes, Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { HiArrowLeft } from "react-icons/hi";

type BreadCrumb = {
  label: string;
  path?: FileRouteTypes["to"];
};

type Props = {
  title: string;
  breadCrumbs?: BreadCrumb[];
  children: React.ReactNode;
};

export const TitleTemplate = ({ title, breadCrumbs, children }: Props) => {
  const handleBack = () => {
    window.history.back();
  };

  return (
    <Stack gap={{ base: 4, lg: 6 }} w="full">
      {/* PC: パンくずリスト */}
      <Box display={{ base: "none", lg: "block" }}>
        <Breadcrumb.Root variant="underline">
          <Breadcrumb.List>
            {breadCrumbs?.map(({ label, path }, i) => (
              <Fragment key={i}>
                {path ? (
                  <Fragment>
                    <Breadcrumb.Item>
                      <Breadcrumb.Link href={path} as={Link}>
                        {label}
                      </Breadcrumb.Link>
                    </Breadcrumb.Item>
                    <Breadcrumb.Separator />
                  </Fragment>
                ) : (
                  <Breadcrumb.Item>
                    <Breadcrumb.CurrentLink>{label}</Breadcrumb.CurrentLink>
                  </Breadcrumb.Item>
                )}
              </Fragment>
            ))}
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </Box>

      {/* SP: 戻るボタン + タイトル */}
      <Box display={{ base: "block", lg: "none" }}>
        <Flex align="center" gap={2}>
          <IconButton aria-label="戻る" onClick={handleBack} variant="ghost" size="sm">
            <HiArrowLeft size={20} />
          </IconButton>
          <Heading size="lg">{title}</Heading>
        </Flex>
      </Box>

      {/* PC: タイトル */}
      <Box display={{ base: "none", lg: "block" }}>
        <Heading size="xl">{title}</Heading>
      </Box>

      {children}
    </Stack>
  );
};
