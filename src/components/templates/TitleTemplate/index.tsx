import { Breadcrumb, Heading, Stack } from "@chakra-ui/react";
import { type FileRouteTypes, Link } from "@tanstack/react-router";
import { Fragment } from "react";

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
  return (
    <Stack gap="6" w="full">
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
      <Heading size="xl">{title}</Heading>
      {children}
    </Stack>
  );
};
