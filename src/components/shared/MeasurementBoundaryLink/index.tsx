import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import type { PublicCtaId } from "@/src/domains/webMeasurement";
import { trackPublicCta } from "@/src/lib/webMeasurement";

type Props = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  measurementCtaId?: PublicCtaId;
};

/** 計測対象と非対象のdocument境界を、third-party scriptが残らない通常navigationで越える。 */
export function MeasurementBoundaryLink({ href, measurementCtaId, onClick, ...props }: Props) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented && measurementCtaId) trackPublicCta(measurementCtaId);
  };

  return <a {...props} href={href} data-measurement-boundary onClick={handleClick} />;
}
