import type { SVGProps } from "react";

type IconProps = {
  size?: number;
  strokeWidth?: number;
} & Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill">;

/**
 * アプリ本体が使っている react-icons/lu と同じ線幅・角丸の作法に合わせたアイコン群。
 * 動画では単色記号として使うため currentColor で塗る。
 */
const Base = ({ size = 32, strokeWidth = 2, children, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IconChat = (props: IconProps) => (
  <Base {...props}>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </Base>
);

export const IconMail = (props: IconProps) => (
  <Base {...props}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </Base>
);

export const IconBell = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Base>
);

export const IconCalendar = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </Base>
);

export const IconCheck = (props: IconProps) => (
  <Base {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Base>
);

export const IconCross = (props: IconProps) => (
  <Base {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Base>
);

export const IconClock = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Base>
);

export const IconTag = (props: IconProps) => (
  <Base {...props}>
    <path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8Z" />
    <path d="M7 7h.01" />
  </Base>
);

export const IconSend = (props: IconProps) => (
  <Base {...props}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </Base>
);

export const IconSmartphone = (props: IconProps) => (
  <Base {...props}>
    <rect x="5" y="2" width="14" height="20" rx="2.5" />
    <path d="M12 18h.01" />
  </Base>
);

export const IconUsers = (props: IconProps) => (
  <Base {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Base>
);

export const IconSparkles = (props: IconProps) => (
  <Base {...props}>
    <path d="m10 3 1.9 4.1L16 9l-4.1 1.9L10 15l-1.9-4.1L4 9l4.1-1.9Z" />
    <path d="M18 16.5 18.9 19l2.5.9-2.5.9L18 23.3l-.9-2.5-2.5-.9 2.5-.9Z" />
  </Base>
);

export const IconUtensils = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 2v7a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V2" />
    <path d="M6 2v20" />
    <path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3Zm0 0v7" />
  </Base>
);

export const IconBag = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </Base>
);

export const IconHeart = (props: IconProps) => (
  <Base {...props}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
  </Base>
);

export const IconMegaphone = (props: IconProps) => (
  <Base {...props}>
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </Base>
);

export const IconScissors = (props: IconProps) => (
  <Base {...props}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.12 15.88" />
    <path d="M14.47 14.48 20 20" />
    <path d="M8.12 8.12 12 12" />
  </Base>
);

export const IconWallet = (props: IconProps) => (
  <Base {...props}>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
    <path d="M17 12h.01" />
  </Base>
);

export const IconArrowRight = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Base>
);
