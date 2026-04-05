# Design-to-Code Workflow

## Overview

Pencil enables a two-way sync between design and code. This reference covers the complete workflow for generating clean, production-ready React + Chakra UI v3 code from Pencil designs.

**Target stack**: React 19, TypeScript, Vite 7, TanStack Router, Chakra UI v3 (style props), react-icons/lu.

## Step 1: Load the `frontend-design` Skill

**MANDATORY.** Before any design or code generation work, load the `frontend-design` skill. This provides:

- Aesthetic direction: bold, intentional design choices (not generic AI slop)
- Typography guidelines: distinctive font pairings, not overused defaults
- Color and theme guidelines: cohesive palettes with dominant colors and sharp accents
- Motion and animation: purposeful transitions and micro-interactions
- Spatial composition: unexpected layouts, asymmetry, generous negative space

Apply these guidelines both when designing in Pencil and when translating the design to code.

## Step 2: Read Design Guidelines

Before generating any code, call the relevant Pencil guidelines:

```
pencil_get_guidelines({ topic: "code" })
```

These return the specific rules for translating .pen design properties into code.

## Step 3: Read Design Tokens

```
pencil_get_variables({ filePath: "path/to/file.pen" })
pencil_get_variables({ filePath: "design/common/token.lib.pen" })
```

Map every Pencil variable to its Chakra UI v3 semantic token and style prop. See [variables-and-tokens.md](variables-and-tokens.md) for the full mapping table.

Key principle: **Pencil variable names map 1:1 to Chakra semantic tokens** using `/` → `.` conversion.

| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `bg/default` | `bg.default` | `bg="bg.default"` |
| `fg/muted` | `fg.muted` | `color="fg.muted"` |
| `border/default` | `border` | `borderColor="border"` |
| `blue/solid` | `blue.solid` | `bg="blue.solid"` or `colorPalette="blue"` |
| `radii/l3` | `l3` | `borderRadius="l3"` |
| `spacing/4` | `4` | `p={4}` |

## Step 4: Read the Design Tree

```
pencil_batch_get({
  filePath: "path/to/file.pen",
  nodeIds: ["screenId"],
  readDepth: 5
})
```

Use sufficient `readDepth` to see the full structure. For complex screens, you may need to read specific subtrees separately.

## Step 5: Map Design Components to Chakra UI v3

Identify reusable components (`reusable: true` nodes) and map them to Chakra compound components or project UI wrappers:

```
pencil_batch_get({
  filePath: "path/to/file.pen",
  patterns: [{ reusable: true }],
  readDepth: 3
})
```

### Pencil → Chakra UI v3 Component Mapping

| Pencil Component Name | Chakra UI v3 Component | Import |
|---|---|---|
| Button / Btn | `<Button>` | `@chakra-ui/react` |
| Card / Tile / Panel | `<Card.Root>`, `<Card.Header>`, `<Card.Body>`, `<Card.Footer>` | `@chakra-ui/react` |
| Input / TextField | `<Input>` | `@chakra-ui/react` |
| Textarea | `<Textarea>` | `@chakra-ui/react` |
| Select / Dropdown | `<Select>` (project wrapper) | `@/src/components/ui/Select` |
| Checkbox | `<Checkbox>` | `@chakra-ui/react` |
| Switch / Toggle | `<Switch>` | `@chakra-ui/react` |
| Badge / Tag / Chip | `<Badge>` | `@chakra-ui/react` |
| Avatar | `<Avatar.Root>`, `<Avatar.Image>`, `<Avatar.Fallback>` | `@chakra-ui/react` |
| Dialog / Modal | `<Dialog>` (project wrapper with `useDialog`) | `@/src/components/ui/Dialog` |
| BottomSheet | `<BottomSheet>` (project wrapper with `useBottomSheet`) | `@/src/components/ui/BottomSheet` |
| Tabs / TabBar | `<Tabs.Root>`, `<Tabs.List>`, `<Tabs.Trigger>`, `<Tabs.Content>` | `@chakra-ui/react` |
| Table / DataTable | `<Table.Root>`, `<Table.Header>`, `<Table.Row>`, `<Table.Cell>` | `@chakra-ui/react` |
| Tooltip | `<Tooltip>` (project wrapper) | `@/src/components/ui/tooltip` |
| Label | `<Field.Label>` | `@chakra-ui/react` |
| Separator / Divider | `<Separator>` | `@chakra-ui/react` |

### Project-Specific UI Wrappers

Always check `src/components/ui/` for existing wrappers before building custom components:

| Wrapper | Description | Hook |
|---|---|---|
| `FormCard` | Card with icon + title for forms | — |
| `Dialog` | Modal dialog | `useDialog()` |
| `BottomSheet` | Bottom-sliding sheet | `useBottomSheet()` |
| `Select` | Custom select | — |
| `Title` | Page title with back button and action | — |
| `Empty` | Empty state display | — |
| `LoadingState` | Loading indicator | — |
| `LazyShow` | Lazy-loaded content | — |
| `ColorPicker` | Color picker | — |

Instances (`ref` nodes) become usages of these components with their overridden props.

## Step 6: Generate Code

### Theme Configuration (Already Set Up)

The theme is configured in `src/configs/theme/index.ts` using Chakra's `createSystem` + `defineConfig` API. **Do not generate CSS theme files** — the theme system is already in place. Code should use semantic tokens via style props.

### Component Code

For custom components with variants, use Chakra's `colorPalette` prop or define recipes in the theme:

```tsx
import { Badge } from "@chakra-ui/react";

type Status = "active" | "inactive" | "error";

const colorMap: Record<Status, string> = {
  active: "green",
  inactive: "gray",
  error: "red",
};

function StatusBadge({ status }: { status: Status }) {
  return <Badge colorPalette={colorMap[status]}>{status}</Badge>;
}
```

Notice:
- All colors use semantic tokens or `colorPalette` prop
- No `className`, no `cn()`, no CVA
- Uses Chakra's built-in component variants
- React 19 style (no `forwardRef`)

### Page/Screen Code

For the screen layout, generate a page component that:
- Uses Chakra layout components (`Box`, `Flex`, `VStack`, `HStack`, `SimpleGrid`)
- Uses Chakra semantic tokens for all style values via style props
- Matches the Pencil node tree structure (vertical → `Flex direction="column"`, horizontal → `Flex`)

```tsx
import { Box, Card, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { LuArrowRight, LuSearch } from "react-icons/lu";
import { Button } from "@chakra-ui/react";

export function DashboardPage() {
  return (
    <Flex direction="column" minH="100vh" bg="bg.default">
      {/* Header */}
      <Flex
        as="header"
        align="center"
        justify="space-between"
        borderBottomWidth="1px"
        borderColor="border"
        px={6}
        py={4}
      >
        <Heading size="lg" color="fg.default">Dashboard</Heading>
        <Input placeholder="Search..." ps={9} />
      </Flex>

      {/* Content */}
      <Box as="main" flex={1} p={6}>
        <Flex gap={6} wrap="wrap">
          <Card.Root flex={1}>
            <Card.Header>
              <Card.Title>Revenue</Card.Title>
            </Card.Header>
            <Card.Body>
              <Text fontSize="2xl" fontWeight="bold" color="fg.default">$45,231</Text>
              <Text fontSize="sm" color="fg.muted">+20% from last month</Text>
            </Card.Body>
          </Card.Root>
        </Flex>

        <Button colorPalette="blue" mt={6}>
          View Details <LuArrowRight />
        </Button>
      </Box>
    </Flex>
  );
}
```

## Step 7: Sync Variables Back (Optional)

If the design tokens were updated in code, sync them back:

```
pencil_set_variables({
  filePath: "path/to/file.pen",
  variables: { ... }
})
```

## Responsive Code from Multi-Artboard Designs

If the Pencil file has artboards at multiple widths:

1. Read all artboards and compare their structures
2. Generate mobile-first code (base styles match the smallest artboard)
3. Use Chakra responsive object syntax: `p={{ base: 4, md: 6, lg: 8 }}`
4. Never hardcode artboard pixel widths — use `w="full"`, `maxW="7xl"`, responsive grid columns

See [responsive-breakpoints.md](responsive-breakpoints.md) for the complete artboard-to-breakpoint mapping.

## Code Generation Rules

### Layout Mapping (Pencil → Chakra)

| Pencil Property | Chakra Implementation |
|---|---|
| `layout: "vertical"` | `<Flex direction="column">` |
| `layout: "horizontal"` | `<Flex>` or `<HStack>` |
| `gap: 4` | `gap={1}` |
| `gap: 8` | `gap={2}` |
| `gap: 12` | `gap={3}` |
| `gap: 16` | `gap={4}` |
| `gap: 20` | `gap={5}` |
| `gap: 24` | `gap={6}` |
| `gap: 32` | `gap={8}` |
| `padding: 16` | `p={4}` |
| `padding: 24` | `p={6}` |
| `padding: 32` | `p={8}` |
| `paddingLeft: 16, paddingRight: 16` | `px={4}` |
| `paddingTop: 24, paddingBottom: 24` | `py={6}` |
| `width: "fill_container"` | `w="full"` or `flex={1}` |
| `height: "fill_container"` | `h="full"` or `flex={1}` |
| `cornerRadius` (via `radii/l3` var) | `borderRadius="l3"` |
| `alignItems: "center"` | `align="center"` |
| `justifyContent: "space-between"` | `justify="space-between"` |

### Typography Mapping (Pencil → Chakra)

| Pencil Property | Chakra Style Prop |
|---|---|
| `fontSize: 12` | `fontSize="xs"` |
| `fontSize: 14` | `fontSize="sm"` |
| `fontSize: 16` | `fontSize="md"` |
| `fontSize: 18` | `fontSize="lg"` |
| `fontSize: 20` | `fontSize="xl"` |
| `fontSize: 24` | `fontSize="2xl"` |
| `fontSize: 30` | `fontSize="3xl"` |
| `fontSize: 36` | `fontSize="4xl"` |
| `fontWeight: "400"` | `fontWeight="normal"` |
| `fontWeight: "500"` | `fontWeight="medium"` |
| `fontWeight: "600"` | `fontWeight="semibold"` |
| `fontWeight: "700"` | `fontWeight="bold"` |

Or use `textStyle` prop: `textStyle="sm"`, `textStyle="lg"`, `textStyle="label"`.

### Color Mapping (Pencil → Chakra)

| Pencil Style | Chakra Style Prop |
|---|---|
| `fill` bound to `bg/default` | `bg="bg.default"` |
| `fill` bound to `bg/panel` | `bg="bg.panel"` |
| `fill` bound to `bg/muted` | `bg="bg.muted"` |
| `fill` bound to `blue/solid` | `bg="blue.solid"` |
| `textColor` bound to `fg/default` | `color="fg.default"` |
| `textColor` bound to `fg/muted` | `color="fg.muted"` |
| `strokeColor` bound to `border/default` | `borderColor="border"` |

### Always Do

- Load the `frontend-design` skill and apply its aesthetic guidelines
- Use Chakra semantic tokens via style props (`bg="bg.default"`, `color="fg.muted"`, `borderRadius="l3"`)
- Use Chakra compound components (Card.Root, Tabs.Root, Avatar.Root, etc.)
- Use `colorPalette` prop for color-schemed components (`<Button colorPalette="teal">`)
- Check `src/components/ui/` for existing project wrappers before building custom components
- Use react-icons with `Lu` prefix: `import { LuSearch } from "react-icons/lu"`
- Use Chakra responsive object syntax: `p={{ base: 4, md: 6 }}`
- Generate TypeScript
- Use React 19 patterns (ref as prop, no `forwardRef`)

### Never Do

- Use `className` with utility classes
- Use `style={{}}` when Chakra style props exist
- Hardcode hex colors: `bg="#3b82f6"` → use `bg="blue.solid"`
- Hardcode pixel values: `p="24px"` → use `p={6}`
- Use `<div>` when `<Box>` or `<Flex>` is appropriate
- Use `cn()`, `clsx()`, CVA, or `tailwind-merge`
- Use `forwardRef` (React 19)
- Use `var(--chakra-...)` in style props — use token names directly
- Skip the `frontend-design` skill

## Icon Library Mapping

Pencil uses Material Icons by default. Map them to react-icons/lu (Lucide):

| Pencil Icon (Material) | Component |
|---|---|
| `search` | `<LuSearch />` |
| `close` | `<LuX />` |
| `menu` | `<LuMenu />` |
| `arrow_forward` | `<LuArrowRight />` |
| `arrow_back` | `<LuArrowLeft />` |
| `person` | `<LuUser />` |
| `settings` | `<LuSettings />` |
| `home` | `<LuHome />` |
| `notifications` | `<LuBell />` |
| `edit` | `<LuPencil />` |
| `delete` | `<LuTrash2 />` |
| `add` | `<LuPlus />` |
| `check` | `<LuCheck />` |
| `visibility` | `<LuEye />` |
| `visibility_off` | `<LuEyeOff />` |
| `chevron_right` | `<LuChevronRight />` |
| `chevron_down` | `<LuChevronDown />` |
| `more_vert` | `<LuMoreVertical />` |
| `mail` | `<LuMail />` |
| `calendar_today` | `<LuCalendar />` |
| `favorite` | `<LuHeart />` |
| `star` | `<LuStar />` |
| `download` | `<LuDownload />` |
| `upload` | `<LuUpload />` |
| `filter_list` | `<LuFilter />` |
| `sort` | `<LuArrowUpDown />` |
| `logout` | `<LuLogOut />` |

All from `react-icons/lu`. Size via `boxSize` prop: `<Icon as={LuSearch} boxSize={4} />`
