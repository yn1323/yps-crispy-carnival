# Chakra UI v3 Mapping Reference

Quick-reference mapping from Pencil design properties to Chakra UI v3 style props and components. Use this when generating code from Pencil designs.

## Color Tokens

### Semantic Color Tokens (Pencil Variable → Chakra Style Prop)

**Background**:
| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `bg/default` | `bg.default` | `bg="bg.default"` |
| `bg/subtle` | `bg.subtle` | `bg="bg.subtle"` |
| `bg/muted` | `bg.muted` | `bg="bg.muted"` |
| `bg/emphasized` | `bg.emphasized` | `bg="bg.emphasized"` |
| `bg/inverted` | `bg.inverted` | `bg="bg.inverted"` |
| `bg/panel` | `bg.panel` | `bg="bg.panel"` |
| `bg/error` | `bg.error` | `bg="bg.error"` |
| `bg/warning` | `bg.warning` | `bg="bg.warning"` |
| `bg/success` | `bg.success` | `bg="bg.success"` |
| `bg/info` | `bg.info` | `bg="bg.info"` |

**Foreground (Text)**:
| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `fg/default` | `fg.default` | `color="fg.default"` |
| `fg/muted` | `fg.muted` | `color="fg.muted"` |
| `fg/subtle` | `fg.subtle` | `color="fg.subtle"` |
| `fg/inverted` | `fg.inverted` | `color="fg.inverted"` |
| `fg/error` | `fg.error` | `color="fg.error"` |
| `fg/warning` | `fg.warning` | `color="fg.warning"` |
| `fg/success` | `fg.success` | `color="fg.success"` |
| `fg/info` | `fg.info` | `color="fg.info"` |

**Border**:
| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `border/default` | `border` | `borderColor="border"` |
| `border/muted` | `border.muted` | `borderColor="border.muted"` |
| `border/emphasized` | `border.emphasized` | `borderColor="border.emphasized"` |
| `border/inverted` | `border.inverted` | `borderColor="border.inverted"` |
| `border/error` | `border.error` | `borderColor="border.error"` |
| `border/warning` | `border.warning` | `borderColor="border.warning"` |
| `border/success` | `border.success` | `borderColor="border.success"` |
| `border/info` | `border.info` | `borderColor="border.info"` |

### Color Palette Semantic Pattern

Each color (gray, red, orange, yellow, green, teal, blue, cyan, purple, pink) has:

| Pencil Variable | Chakra Token | Usage |
|---|---|---|
| `{color}/solid` | `{color}.solid` | Solid fill: `bg="{color}.solid"` |
| `{color}/fg` | `{color}.fg` | Text on light bg: `color="{color}.fg"` |
| `{color}/subtle` | `{color}.subtle` | Light bg: `bg="{color}.subtle"` |
| `{color}/muted` | `{color}.muted` | Muted bg: `bg="{color}.muted"` |
| `{color}/emphasized` | `{color}.emphasized` | Emphasized bg: `bg="{color}.emphasized"` |
| `{color}/contrast` | `{color}.contrast` | Text on solid: `color="{color}.contrast"` |
| `{color}/focusRing` | `{color}.focusRing` | Focus ring: `ringColor="{color}.focusRing"` |

### Common Combinations

| Design Intent | Chakra Implementation |
|---|---|
| Primary button | `<Button colorPalette="blue">` |
| Secondary button | `<Button variant="outline">` |
| Destructive button | `<Button colorPalette="red">` |
| Ghost button | `<Button variant="ghost">` |
| Card surface | `<Card.Root variant="outline">` |
| Muted text | `color="fg.muted"` |
| Page background | `bg="bg.default"` |
| Input field | `<Input>` (styled by recipe) |
| Badge (success) | `<Badge colorPalette="green">` |

## Radius Tokens

| Pencil Variable | Chakra Token | Style Prop |
|---|---|---|
| `radii/none` (0) | `none` | `borderRadius="none"` |
| `radii/2xs` (1) | `2xs` | `borderRadius="2xs"` |
| `radii/xs` (2) | `xs` | `borderRadius="xs"` |
| `radii/sm` (4) | `sm` | `borderRadius="sm"` |
| `radii/md` (6) | `md` | `borderRadius="md"` |
| `radii/lg` (8) | `lg` | `borderRadius="lg"` |
| `radii/xl` (12) | `xl` | `borderRadius="xl"` |
| `radii/2xl` (16) | `2xl` | `borderRadius="2xl"` |
| `radii/full` (9999) | `full` | `borderRadius="full"` |
| `radii/l1` (2) | `l1` | `borderRadius="l1"` |
| `radii/l2` (4) | `l2` | `borderRadius="l2"` |
| `radii/l3` (6) | `l3` | `borderRadius="l3"` |

Semantic aliases: `l1` = xs (2px), `l2` = sm (4px), `l3` = md (6px).

## Spacing Tokens

Pencil spacing variables map directly to Chakra numeric tokens. The value is `token × 4px`.

| Pencil Variable | px Value | Chakra Token | Style Prop |
|---|---|---|---|
| `spacing/0.5` | 2px | `0.5` | `p={0.5}` |
| `spacing/1` | 4px | `1` | `p={1}` |
| `spacing/2` | 8px | `2` | `p={2}` |
| `spacing/3` | 12px | `3` | `p={3}` |
| `spacing/4` | 16px | `4` | `p={4}` |
| `spacing/5` | 20px | `5` | `p={5}` |
| `spacing/6` | 24px | `6` | `p={6}` |
| `spacing/8` | 32px | `8` | `p={8}` |
| `spacing/10` | 40px | `10` | `p={10}` |
| `spacing/12` | 48px | `12` | `p={12}` |
| `spacing/16` | 64px | `16` | `p={16}` |

## Layout Properties

| Pencil Property | Chakra Implementation |
|---|---|
| `layout: "vertical"` | `<Flex direction="column">` or `<VStack>` |
| `layout: "horizontal"` | `<Flex direction="row">` or `<HStack>` |
| `gap: 4` | `gap={1}` |
| `gap: 8` | `gap={2}` |
| `gap: 12` | `gap={3}` |
| `gap: 16` | `gap={4}` |
| `gap: 20` | `gap={5}` |
| `gap: 24` | `gap={6}` |
| `gap: 32` | `gap={8}` |
| `padding: 8` | `p={2}` |
| `padding: 12` | `p={3}` |
| `padding: 16` | `p={4}` |
| `padding: 20` | `p={5}` |
| `padding: 24` | `p={6}` |
| `padding: 32` | `p={8}` |
| `paddingLeft: 16, paddingRight: 16` | `px={4}` |
| `paddingTop: 24, paddingBottom: 24` | `py={6}` |
| `width: "fill_container"` | `w="full"` or `flex={1}` |
| `height: "fill_container"` | `h="full"` or `flex={1}` |
| `cornerRadius` (via variable) | `borderRadius="l2"` etc. |
| `alignItems: "center"` | `align="center"` |
| `alignItems: "start"` | `align="start"` (on Flex) |
| `alignItems: "end"` | `align="end"` (on Flex) |
| `justifyContent: "center"` | `justify="center"` |
| `justifyContent: "space-between"` | `justify="space-between"` |
| `justifyContent: "end"` | `justify="end"` |

## Typography

| Pencil Property | Chakra Style Prop |
|---|---|
| `fontSize: 10` | `fontSize="2xs"` |
| `fontSize: 12` | `fontSize="xs"` |
| `fontSize: 14` | `fontSize="sm"` |
| `fontSize: 16` | `fontSize="md"` |
| `fontSize: 18` | `fontSize="lg"` |
| `fontSize: 20` | `fontSize="xl"` |
| `fontSize: 24` | `fontSize="2xl"` |
| `fontSize: 30` | `fontSize="3xl"` |
| `fontSize: 36` | `fontSize="4xl"` |
| `fontSize: 48` | `fontSize="5xl"` |
| `fontWeight: "400"` | `fontWeight="normal"` |
| `fontWeight: "500"` | `fontWeight="medium"` |
| `fontWeight: "600"` | `fontWeight="semibold"` |
| `fontWeight: "700"` | `fontWeight="bold"` |

Or use the `textStyle` prop for pre-composed typography: `textStyle="sm"`, `textStyle="lg"`, `textStyle="label"`.

## Pencil Component → Chakra UI v3 Mapping

| Pencil Component | Chakra UI v3 Component | Import |
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
| Dialog / Modal | `<Dialog>` (project wrapper) | `@/src/components/ui/Dialog` |
| BottomSheet | `<BottomSheet>` (project wrapper) | `@/src/components/ui/BottomSheet` |
| Tabs / TabBar | `<Tabs.Root>`, `<Tabs.List>`, `<Tabs.Trigger>`, `<Tabs.Content>` | `@chakra-ui/react` |
| Table / DataTable | `<Table.Root>`, `<Table.Header>`, `<Table.Row>`, `<Table.Cell>` | `@chakra-ui/react` |
| Tooltip | `<Tooltip>` (project wrapper) | `@/src/components/ui/tooltip` |
| Separator / Divider | `<Separator>` | `@chakra-ui/react` |
| Label | `<Field.Label>` | `@chakra-ui/react` |
| FormCard | `<FormCard>` (project wrapper) | `@/src/components/ui/FormCard` |
| Empty State | `<Empty>` (project wrapper) | `@/src/components/ui/Empty` |
| Page Title | `<Title>` (project wrapper) | `@/src/components/ui/Title` |

**Project UI wrappers** (`src/components/ui/`): Always check if a wrapper exists before building from scratch. Wrappers include: FormCard, Dialog (with `useDialog`), BottomSheet (with `useBottomSheet`), Select, Title, Empty, LoadingState, LazyShow, ColorPicker, tooltip, toaster.

## Icon Mapping (Material → react-icons/lu)

| Pencil (Material) | react-icons Import | Component |
|---|---|---|
| `search` | `react-icons/lu` | `<LuSearch />` |
| `close` | `react-icons/lu` | `<LuX />` |
| `menu` | `react-icons/lu` | `<LuMenu />` |
| `arrow_forward` | `react-icons/lu` | `<LuArrowRight />` |
| `arrow_back` | `react-icons/lu` | `<LuArrowLeft />` |
| `person` | `react-icons/lu` | `<LuUser />` |
| `settings` | `react-icons/lu` | `<LuSettings />` |
| `home` | `react-icons/lu` | `<LuHome />` |
| `notifications` | `react-icons/lu` | `<LuBell />` |
| `edit` | `react-icons/lu` | `<LuPencil />` |
| `delete` | `react-icons/lu` | `<LuTrash2 />` |
| `add` | `react-icons/lu` | `<LuPlus />` |
| `check` | `react-icons/lu` | `<LuCheck />` |
| `visibility` | `react-icons/lu` | `<LuEye />` |
| `visibility_off` | `react-icons/lu` | `<LuEyeOff />` |
| `chevron_right` | `react-icons/lu` | `<LuChevronRight />` |
| `chevron_down` | `react-icons/lu` | `<LuChevronDown />` |
| `more_vert` | `react-icons/lu` | `<LuMoreVertical />` |
| `more_horiz` | `react-icons/lu` | `<LuMoreHorizontal />` |
| `favorite` | `react-icons/lu` | `<LuHeart />` |
| `star` | `react-icons/lu` | `<LuStar />` |
| `download` | `react-icons/lu` | `<LuDownload />` |
| `upload` | `react-icons/lu` | `<LuUpload />` |
| `filter_list` | `react-icons/lu` | `<LuFilter />` |
| `sort` | `react-icons/lu` | `<LuArrowUpDown />` |
| `mail` | `react-icons/lu` | `<LuMail />` |
| `calendar_today` | `react-icons/lu` | `<LuCalendar />` |
| `logout` | `react-icons/lu` | `<LuLogOut />` |

Icons are sized via the `boxSize` prop or Chakra `Icon` wrapper: `<Icon as={LuSearch} boxSize={4} />`

## Anti-Patterns

These patterns indicate a code generation error. Fix immediately:

```
WRONG                                   RIGHT
─────                                   ─────
bg="#3b82f6"                            bg="blue.500" or bg="blue.solid"
color="#ffffff"                          color="fg.inverted" or color="white"
p="24px"                                p={6}
borderRadius="6px"                      borderRadius="md" or borderRadius="l3"
className="flex flex-col gap-4"         <Flex direction="column" gap={4}>
style={{ color: 'red' }}                color="red.500" or color="fg.error"
<div className="...">                   <Box> or <Flex> with style props
bg="var(--chakra-colors-blue-500)"      bg="blue.500"
```

## See Also

- [design-to-code-workflow.md](design-to-code-workflow.md) — Complete code generation workflow
- [variables-and-tokens.md](variables-and-tokens.md) — How to read and map Pencil design tokens
- [responsive-breakpoints.md](responsive-breakpoints.md) — Responsive patterns with Chakra
