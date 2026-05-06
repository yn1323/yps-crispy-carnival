# Variables and Design Tokens

## Why This Matters

Pencil variables are the equivalent of design tokens. When you hardcode values like `fill: "#3b82f6"` or `cornerRadius: 8` instead of referencing a variable:

- Code generation produces hardcoded hex values or inline styles like `bg="#3b82f6"`, making theming impossible
- Dark mode won't work because the values don't adapt to theme changes
- Global design updates require manual find-and-replace instead of changing one variable
- The design diverges from the codebase's token system

## Step-by-Step: Reading and Using Variables

### Step 1: Read All Variables

Always do this at the start of any design task:

```
pencil_get_variables({ filePath: "path/to/file.pen" })
```

This returns all defined variables with their values. Example output:

```json
{
  "variables": {
    "bg/default": { "type": "color", "value": "#FFFFFF" },
    "bg/muted": { "type": "color", "value": "#f4f4f5" },
    "fg/default": { "type": "color", "value": "#09090B" },
    "fg/muted": { "type": "color", "value": "#52525b" },
    "border/default": { "type": "color", "value": "#e4e4e7" },
    "blue/solid": { "type": "color", "value": "#2563eb" },
    "radii/l2": { "type": "number", "value": 4 },
    "radii/l3": { "type": "number", "value": 6 },
    "spacing/4": { "type": "number", "value": 16 },
    "fontSize/sm": { "type": "number", "value": 14 }
  }
}
```

Also read design tokens from the shared library:

```
pencil_get_variables({ filePath: "design/common/token.lib.pen" })
```

### Step 2: Map Your Values to Variables

Before applying any style, check if a variable exists for it:

| What you want | Don't use | Use instead |
|---|---|---|
| Blue brand color | `fill: "#2563eb"` | Reference the `blue/solid` variable |
| White text on solid | `textColor: "#ffffff"` | Reference the `blue/contrast` variable |
| Border color | `strokeColor: "#e4e4e7"` | Reference the `border/default` variable |
| Medium rounding | `cornerRadius: [6,6,6,6]` | Reference the `radii/l3` variable |
| Page background | `fill: "#ffffff"` | Reference the `bg/default` variable |
| Body text color | `textColor: "#09090B"` | Reference the `fg/default` variable |

### Step 3: Apply Variables in Design

When the .pen file schema supports variable binding, bind properties to variables instead of using raw values. The exact binding mechanism depends on the schema returned by `pencil_get_editor_state` - consult the schema for the correct variable reference syntax.

### Step 4: Create Missing Variables

If you need a token that doesn't exist, create it:

```
pencil_set_variables({
  filePath: "path/to/file.pen",
  variables: {
    "accent/solid": { "type": "color", "value": "#f59e0b" },
    "accent/contrast": { "type": "color", "value": "#ffffff" }
  }
})
```

Then use the new variable instead of hardcoding.

## Theme Support

Variables can have different values per theme (e.g., light and dark mode):

```json
{
  "bg/default": {
    "themes": {
      "light": "#FFFFFF",
      "dark": "#09090B"
    }
  }
}
```

When using themed variables, the design automatically adapts when switching themes. Hardcoded values break this entirely.

## Variables in Code Generation (Chakra UI v3)

When generating code from a Pencil design, Pencil variables map directly to **Chakra UI v3 semantic tokens and style props**. The naming convention is 1:1 — Pencil uses `/` separators while Chakra uses `.` separators.

### Token Sources

1. **design/common/token.lib.pen** — Pencil design tokens (read via `get_variables`)
2. **src/configs/theme/** — Chakra theme configuration (the code-side source of truth)
   - `tokens/` — Base tokens (colors, spacing, radii, fonts)
   - `semantic-tokens/` — Semantic tokens (bg.*, fg.*, border.*, {color}.solid etc.)
   - `breakpoints.ts` — Responsive breakpoints (sm:480px, md:768px, lg:1024px, xl:1280px, 2xl:1536px)
   - `text-styles.ts` — Pre-composed typography (2xs–7xl, label)
   - `recipes/` + `slot-recipes/` — Component variant definitions

### Semantic Color Token Mapping

Pencil variables map 1:1 to Chakra semantic tokens:

| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `bg/default` | `bg.default` | `bg="bg.default"` |
| `bg/subtle` | `bg.subtle` | `bg="bg.subtle"` |
| `bg/muted` | `bg.muted` | `bg="bg.muted"` |
| `bg/emphasized` | `bg.emphasized` | `bg="bg.emphasized"` |
| `bg/panel` | `bg.panel` | `bg="bg.panel"` |
| `bg/error` | `bg.error` | `bg="bg.error"` |
| `bg/success` | `bg.success` | `bg="bg.success"` |
| `fg/default` | `fg.default` | `color="fg.default"` |
| `fg/muted` | `fg.muted` | `color="fg.muted"` |
| `fg/subtle` | `fg.subtle` | `color="fg.subtle"` |
| `fg/error` | `fg.error` | `color="fg.error"` |
| `border/default` | `border` | `borderColor="border"` |
| `border/error` | `border.error` | `borderColor="border.error"` |

### Color Palette Token Mapping

Each color has a semantic pattern (for gray, red, orange, yellow, green, teal, blue, cyan, purple, pink):

| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `{color}/solid` | `{color}.solid` | `bg="{color}.solid"` |
| `{color}/fg` | `{color}.fg` | `color="{color}.fg"` |
| `{color}/subtle` | `{color}.subtle` | `bg="{color}.subtle"` |
| `{color}/muted` | `{color}.muted` | `bg="{color}.muted"` |
| `{color}/contrast` | `{color}.contrast` | `color="{color}.contrast"` |

For components, use the `colorPalette` prop: `<Button colorPalette="blue">` applies the full color scheme.

### Radius Token Mapping

| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `radii/l1` (2px) | `l1` | `borderRadius="l1"` |
| `radii/l2` (4px) | `l2` | `borderRadius="l2"` |
| `radii/l3` (6px) | `l3` | `borderRadius="l3"` |
| `radii/sm` (4px) | `sm` | `borderRadius="sm"` |
| `radii/md` (6px) | `md` | `borderRadius="md"` |
| `radii/lg` (8px) | `lg` | `borderRadius="lg"` |
| `radii/xl` (12px) | `xl` | `borderRadius="xl"` |
| `radii/full` (9999px) | `full` | `borderRadius="full"` |

### Spacing Token Mapping

| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `spacing/1` (4px) | `1` | `p={1}`, `gap={1}` |
| `spacing/2` (8px) | `2` | `p={2}`, `gap={2}` |
| `spacing/3` (12px) | `3` | `p={3}`, `gap={3}` |
| `spacing/4` (16px) | `4` | `p={4}`, `gap={4}` |
| `spacing/6` (24px) | `6` | `p={6}`, `gap={6}` |
| `spacing/8` (32px) | `8` | `p={8}`, `gap={8}` |

### What NEVER to Generate

| Bad (hardcoded / className) | Good (Chakra style props) |
|---|---|
| `bg="#3b82f6"` | `bg="blue.solid"` or `bg="blue.500"` |
| `color="#ffffff"` | `color="fg.inverted"` or `color="white"` |
| `style={{ backgroundColor: 'var(--chakra-colors-blue-500)' }}` | `bg="blue.500"` |
| `className="bg-primary text-white"` | `bg="blue.solid" color="blue.contrast"` |
| `borderRadius="6px"` | `borderRadius="l3"` or `borderRadius="md"` |
| `p="24px"` | `p={6}` |

The rule is simple: **if a Pencil variable exists for the value, there is a corresponding Chakra semantic token. Use the token via style props, not raw values or className.**

### Opacity

Use Chakra's alpha color tokens or the `opacity` prop:

```tsx
<Box bg="blackAlpha.500">   {/* Black at 50% opacity */}
<Box bg="whiteAlpha.300">   {/* White at 30% opacity */}
<Box bg="blue.500" opacity={0.9}>  {/* Blue at 90% opacity */}
```

## Checklist

Before applying any style value:

- [ ] Have I called `pencil_get_variables` to see available tokens?
- [ ] Have I also read `design/common/token.lib.pen` for shared tokens?
- [ ] Am I using a variable reference instead of a hardcoded color value?
- [ ] Am I using a variable reference instead of a hardcoded border radius?
- [ ] If the needed variable doesn't exist, have I created it with `pencil_set_variables`?
- [ ] For code generation: am I outputting Chakra style props (`bg="bg.default"`, `borderRadius="l3"`), NOT raw values (`bg="#fff"`, `borderRadius="6px"`)?

## Common Variable Categories

| Category | Pencil Variables | Chakra Approach |
|---|---|---|
| Surface colors | `bg/default`, `bg/panel`, `bg/subtle` | `bg="bg.default"`, `bg="bg.panel"` |
| Text colors | `fg/default`, `fg/muted`, `fg/error` | `color="fg.default"`, `color="fg.muted"` |
| Brand colors | `{color}/solid`, `{color}/fg` | `colorPalette="blue"` on components |
| Semantic colors | `bg/error`, `fg/success`, `border/warning` | `bg="bg.error"`, `color="fg.success"` |
| UI borders | `border/default`, `border/muted` | `borderColor="border"`, `borderColor="border.muted"` |
| Border radius | `radii/l1`, `radii/l2`, `radii/l3` | `borderRadius="l1"`, `borderRadius="l2"` |
| Typography | `fontSize/sm`, `fontWeight/medium` | `fontSize="sm"`, `fontWeight="medium"` or `textStyle="sm"` |
| Spacing | `spacing/4`, `spacing/6` | `p={4}`, `gap={6}` |

## See Also

- [chakra-mapping.md](chakra-mapping.md) — Full quick-reference mapping tables for code generation
- [design-to-code-workflow.md](design-to-code-workflow.md) — Complete code generation workflow using these tokens
- [responsive-breakpoints.md](responsive-breakpoints.md) — Breakpoint tokens and responsive patterns
