import { defineRecipe } from "@chakra-ui/react";

export const buttonRecipe = defineRecipe({
  className: "chakra-button",
  base: {
    display: "inline-flex",
    appearance: "none",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    position: "relative",
    borderRadius: "l2",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
    borderWidth: "1px",
    borderColor: "transparent",
    cursor: "button",
    flexShrink: "0",
    outline: "0",
    lineHeight: "1.2",
    isolation: "isolate",
    fontWeight: "medium",
    transitionProperty: "common",
    transitionDuration: "moderate",
    focusVisibleRing: "outside",
    _disabled: {
      layerStyle: "disabled",
    },
    _icon: {
      flexShrink: "0",
    },
  },
  variants: {
    size: {
      "2xs": {
        h: "6",
        minW: "6",
        textStyle: "xs",
        px: "2",
        gap: "1",
        _icon: {
          width: "3.5",
          height: "3.5",
        },
      },
      xs: {
        h: "8",
        minW: "8",
        textStyle: "xs",
        px: "2.5",
        gap: "1",
        _icon: {
          width: "4",
          height: "4",
        },
      },
      sm: {
        h: "9",
        minW: "9",
        px: "3.5",
        textStyle: "sm",
        gap: "2",
        _icon: {
          width: "4",
          height: "4",
        },
      },
      md: {
        h: "10",
        minW: "10",
        textStyle: "sm",
        px: "4",
        gap: "2",
        _icon: {
          width: "5",
          height: "5",
        },
      },
      lg: {
        h: "11",
        minW: "11",
        textStyle: "md",
        px: "5",
        gap: "3",
        _icon: {
          width: "5",
          height: "5",
        },
      },
      xl: {
        h: "12",
        minW: "12",
        textStyle: "md",
        px: "5",
        gap: "2.5",
        _icon: {
          width: "5",
          height: "5",
        },
      },
      "2xl": {
        h: "16",
        minW: "16",
        textStyle: "lg",
        px: "7",
        gap: "3",
        _icon: {
          width: "6",
          height: "6",
        },
      },
    },
    variant: {
      solid: {
        bg: "colorPalette.solid",
        color: "colorPalette.contrast",
        borderColor: "transparent",
        _hover: {
          bg: "colorPalette.solid/92",
          shadow: "xs",
        },
        _active: {
          bg: "colorPalette.solid",
          transform: "translateY(1px)",
        },
        _expanded: {
          bg: "colorPalette.solid/92",
        },
      },
      subtle: {
        bg: "colorPalette.subtle",
        color: "colorPalette.fg",
        borderColor: "transparent",
        _hover: {
          bg: "colorPalette.muted",
        },
        _expanded: {
          bg: "colorPalette.muted",
        },
      },
      surface: {
        bg: "colorPalette.subtle",
        color: "colorPalette.fg",
        shadow: "0 0 0px 1px var(--shadow-color)",
        shadowColor: "colorPalette.muted",
        _hover: {
          bg: "colorPalette.muted",
        },
        _expanded: {
          bg: "colorPalette.muted",
        },
      },
      outline: {
        borderWidth: "1px",
        borderColor: "colorPalette.muted",
        color: "colorPalette.fg",
        bg: "bg.panel",
        _hover: {
          bg: "gray.50",
          borderColor: "colorPalette.solid",
          color: "colorPalette.solid",
        },
        _active: {
          bg: "gray.100",
          borderColor: "colorPalette.solid",
          color: "colorPalette.solid",
        },
        _expanded: {
          bg: "gray.50",
          borderColor: "colorPalette.solid",
          color: "colorPalette.solid",
        },
      },
      outlineOnTint: {
        bg: "white",
        borderWidth: "1px",
        borderColor: "colorPalette.solid",
        color: "colorPalette.fg",
        shadow: "0 1px 2px var(--shadow-color)",
        shadowColor: "blackAlpha.100",
        _hover: {
          bg: "colorPalette.solid",
          borderColor: "colorPalette.solid",
          color: "colorPalette.contrast",
          shadow: "0 8px 18px var(--shadow-color)",
          shadowColor: "colorPalette.muted",
        },
        _active: {
          bg: "colorPalette.solid",
          color: "colorPalette.contrast",
          transform: "translateY(1px)",
          shadow: "0 3px 8px var(--shadow-color)",
          shadowColor: "colorPalette.muted",
        },
        _expanded: {
          bg: "colorPalette.solid",
          borderColor: "colorPalette.solid",
          color: "colorPalette.contrast",
        },
      },
      ghost: {
        bg: "transparent",
        color: "colorPalette.fg",
        _hover: {
          bg: "blackAlpha.50",
          color: "colorPalette.solid",
        },
        _active: {
          bg: "blackAlpha.100",
          color: "colorPalette.solid",
        },
        _expanded: {
          bg: "blackAlpha.50",
          color: "colorPalette.solid",
        },
      },
      plain: {
        color: "colorPalette.fg",
        _hover: {
          color: "colorPalette.solid",
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        },
        _active: {
          color: "colorPalette.solid",
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
    variant: "solid",
  },
});
