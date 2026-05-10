import { Link } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";
import { LuExternalLink } from "react-icons/lu";

type Props = Omit<ComponentProps<typeof Link>, "children" | "href" | "target" | "rel"> & {
  href: string;
  children: ReactNode;
};

export const LegalDocumentLink = ({ href, children, color = "teal.700", ...props }: Props) => {
  const { "aria-label": ariaLabel, ...linkProps } = props;
  const computedAriaLabel = ariaLabel ?? (typeof children === "string" ? `${children}（別タブで開きます）` : undefined);

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      color={color}
      display="inline-flex"
      alignItems="center"
      gap={1}
      me={0.5}
      verticalAlign="-0.125em"
      aria-label={computedAriaLabel}
      {...linkProps}
    >
      {children}
      <LuExternalLink aria-hidden="true" focusable="false" size={12} />
    </Link>
  );
};
