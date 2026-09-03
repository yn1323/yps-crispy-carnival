import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import type { PublicCtaId } from "@/src/domains/webMeasurement";
import { trackPublicCta } from "@/src/lib/webMeasurement";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  measurementCtaId?: PublicCtaId;
};

/** 通常のdocument navigationを使い、登録済みCTAがあれば遷移前に記録する。 */
export function MeasurementLink({ href, measurementCtaId, onClick, ...props }: Props) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented && measurementCtaId) trackPublicCta(measurementCtaId);
  };

  return <a {...props} href={href} data-measurement-link onClick={handleClick} />;
}
