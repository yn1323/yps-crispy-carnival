import { defineGlobalStyles } from "@chakra-ui/react";

const mobileTextInputSelector = [
  "input:not([type])",
  'input[type="text"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="tel"]',
  'input[type="url"]',
  'input[type="number"]',
  "textarea",
  "select",
  '[data-scope="select"][data-part="trigger"]',
].join(", ");

export const globalCss = defineGlobalStyles({
  "*": {
    fontFeatureSettings: '"cv11"',
    "--ring-inset": "var(--chakra-empty,/*!*/ /*!*/)",
    "--ring-offset-width": "0px",
    "--ring-offset-color": "#fff",
    "--ring-color": "rgba(66, 153, 225, 0.6)",
    "--ring-offset-shadow": "0 0 #0000",
    "--ring-shadow": "0 0 #0000",
    "--brightness": "var(--chakra-empty,/*!*/ /*!*/)",
    "--contrast": "var(--chakra-empty,/*!*/ /*!*/)",
    "--grayscale": "var(--chakra-empty,/*!*/ /*!*/)",
    "--hue-rotate": "var(--chakra-empty,/*!*/ /*!*/)",
    "--invert": "var(--chakra-empty,/*!*/ /*!*/)",
    "--saturate": "var(--chakra-empty,/*!*/ /*!*/)",
    "--sepia": "var(--chakra-empty,/*!*/ /*!*/)",
    "--drop-shadow": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-blur": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-brightness": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-contrast": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-grayscale": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-hue-rotate": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-invert": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-opacity": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-saturate": "var(--chakra-empty,/*!*/ /*!*/)",
    "--backdrop-sepia": "var(--chakra-empty,/*!*/ /*!*/)",
    "--global-font-mono": "fonts.mono",
    "--global-font-body": "fonts.body",
    "--global-color-border": "colors.border",
  },
  html: {
    color: "fg",
    bg: "bg",
    lineHeight: "1.5",
    colorPalette: "gray",
    scrollbarGutter: "stable",
  },
  "*::placeholder, *[data-placeholder]": {
    color: "fg.muted/80",
  },
  [mobileTextInputSelector]: {
    "@media screen and (max-width: 767px), screen and (orientation: landscape) and (max-width: 1023px) and (max-height: 767px)":
      {
        // Chakraのsize recipeや個別指定より優先し、iOSのフォーカス時ズームを防ぐ。
        fontSize: "16px !important",
      },
  },
});
