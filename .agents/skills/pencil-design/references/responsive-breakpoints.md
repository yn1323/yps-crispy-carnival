# Responsive Breakpoints

## Why This Matters

Pencil designs often use multiple artboards at different widths to represent mobile, tablet, and desktop views. When generating code, these artboard sizes must map to Chakra UI v3 responsive breakpoints correctly — otherwise the responsive behavior in the browser won't match the design.

Getting this wrong produces:
- Layouts that break at wrong screen sizes
- Mobile designs appearing at tablet widths
- Desktop layouts that don't scale down properly
- Redundant or missing breakpoint overrides

## Pencil Artboard Sizes → Chakra Breakpoints

### Standard Artboard Widths

| Device | Pencil Artboard Width | Chakra Breakpoint | Key |
|--------|----------------------|-------------------|-----|
| Mobile (small) | 320px | Default (no key) | `base` |
| Mobile (standard) | 375px | Default (no key) | `base` |
| Mobile (large) | 393-430px | Default (no key) | `base` |
| Tablet (portrait) | 768px | `md` | `md` |
| Tablet (landscape) | 1024px | `lg` | `lg` |
| Desktop | 1280px | `xl` | `xl` |
| Desktop (wide) | 1440-1536px | `2xl` | `2xl` |

### Project Breakpoint Values

Defined in `src/configs/theme/breakpoints.ts`:

```
sm  →  480px
md  →  768px
lg  →  1024px
xl  →  1280px
2xl →  1536px
```

Note: `sm` is 480px (not 640px like Tailwind default).

## Mapping Pencil Multi-Artboard Designs to Code

### Reading Multiple Artboards

When a design has artboards at different widths, read all of them:

```
pencil_batch_get({
  filePath: "path/to/file.pen",
  patterns: [{ type: "frame", name: "Mobile|Tablet|Desktop" }],
  readDepth: 4
})
```

Or read top-level nodes to identify all screens:

```
pencil_batch_get({ filePath: "path/to/file.pen" })
```

### Code Generation Strategy

Generate mobile-first code using Chakra's responsive object syntax:

```tsx
// Mobile-first: base styles match the mobile artboard
// md: styles match the tablet artboard
// lg: styles match the desktop artboard

<Flex
  direction={{ base: "column", md: "row" }}
  gap={{ base: 4, md: 6, lg: 8 }}
  p={{ base: 4, md: 6, lg: 8 }}
>
  {/* Sidebar: stacks below content on mobile, beside it on tablet+ */}
  <Box w={{ base: "full", md: "64", lg: "72" }}>
    {/* ... */}
  </Box>

  {/* Main content: full width on mobile, flexible on tablet+ */}
  <Box flex={1}>
    {/* ... */}
  </Box>
</Flex>
```

### Common Responsive Patterns

| Pencil Design Pattern | Chakra Implementation |
|---|---|
| 1 col → 2 col → 3 col | `<SimpleGrid columns={{ base: 1, md: 2, lg: 3 }}>` |
| Stacked sidebar → side-by-side | `<Flex direction={{ base: "column", lg: "row" }}>` |
| Hidden on mobile, visible on desktop | `<Box display={{ base: "none", lg: "block" }}>` |
| Visible on mobile, hidden on desktop | `<Box display={{ base: "block", lg: "none" }}>` |
| Full-width mobile, constrained desktop | `<Box w="full" maxW="7xl" mx="auto">` |
| Small text mobile, larger desktop | `<Text fontSize={{ base: "sm", md: "md", lg: "lg" }}>` |
| Reduced padding mobile, more desktop | `p={{ base: 4, md: 6, lg: 8 }}` |
| Card grid responsive | `<SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={{ base: 4, md: 6 }}>` |
| Navigation: hamburger → full nav | Mobile: `<BottomSheet>` / Desktop: `<Box display={{ base: "none", md: "flex" }}>` |

### Layout Differences Between Artboards

When comparing mobile vs desktop artboards, look for these differences:

| What Changes | Mobile Artboard | Desktop Artboard | Chakra Pattern |
|---|---|---|---|
| Layout direction | `layout: "vertical"` | `layout: "horizontal"` | `direction={{ base: "column", lg: "row" }}` |
| Column count | 1 column | 2-4 columns | `columns={{ base: 1, lg: 3 }}` |
| Visibility | Element missing | Element present | `display={{ base: "none", lg: "block" }}` |
| Font size | Smaller | Larger | `fontSize={{ base: "2xl", lg: "4xl" }}` |
| Padding | 16px | 24-32px | `p={{ base: 4, lg: 8 }}` |
| Gap | 16px | 24px | `gap={{ base: 4, lg: 6 }}` |
| Sidebar | Hidden or stacked | Side-by-side | `display={{ base: "none", lg: "block" }}` + `w="64"` |
| Image size | Smaller/cropped | Full size | `h={{ base: "48", lg: "80" }}` |

## Anti-Patterns

| Wrong | Right |
|---|---|
| Hardcoding pixel widths from artboard | Use responsive object syntax |
| Building separate components for mobile/desktop | One component with responsive props |
| Using CSS `@media` queries directly | Use Chakra responsive object syntax |
| Ignoring the mobile artboard | Always start from mobile (`base`), add `md:` / `lg:` overrides |
| `w="375px"` from mobile artboard | `w="full"` with responsive max-width |
| `w="1440px"` from desktop artboard | `maxW="7xl" mx="auto"` |
| `className="md:flex-row"` | `direction={{ base: "column", md: "row" }}` |
| Using `display="none"` + JS toggle | `display={{ base: "none", md: "block" }}` |

## Checklist

When generating code from multi-artboard Pencil designs:

- [ ] Have I identified all artboard sizes and mapped them to Chakra breakpoints?
- [ ] Am I generating mobile-first code (base styles = mobile artboard)?
- [ ] Am I using Chakra responsive object syntax (`{{ base: ..., md: ..., lg: ... }}`)?
- [ ] Have I compared artboards to identify what changes between sizes?
- [ ] Am I using `SimpleGrid` or responsive `columns` for column count changes?
- [ ] Am I using responsive `display` for visibility changes?
- [ ] Am I avoiding hardcoded pixel widths from artboard dimensions?

## See Also

- [chakra-mapping.md](chakra-mapping.md) — Layout property mapping table
- [design-to-code-workflow.md](design-to-code-workflow.md) — Complete code generation workflow
