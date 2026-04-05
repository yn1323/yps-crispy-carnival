# Pencil Design Skill

An [Agent Skills](https://agentskills.io) skill for designing production-quality UIs in [Pencil](https://pencil.dev) and generating clean, maintainable code.

## Overview

This skill helps AI agents work effectively with Pencil (`.pen` files) — a vector design tool that integrates into IDEs. It enforces best practices for:

- **Design system reuse** — Using existing components instead of recreating them
- **Design tokens** — Using variables instead of hardcoded values
- **Layout correctness** — Preventing overflow and visual defects
- **Visual verification** — Taking screenshots to verify designs
- **Code generation** — Producing React + Chakra UI v3 code

## When to Use

Load this skill when:

- Designing screens, pages, or components in a `.pen` file
- Generating code (React + Chakra UI v3) from Pencil designs
- Building or extending a design system in Pencil
- Syncing design tokens between Pencil and code
- Importing existing code into Pencil designs
- Working with any Pencil MCP tools

## The 6 Critical Rules

This skill enforces 6 rules that prevent common agent mistakes:

### 1. Always Reuse Design System Components
**Never recreate a component from scratch when one exists.** Search for reusable components (`reusable: true`) and insert them as `ref` instances.

### 2. Always Use Variables Instead of Hardcoded Values
**Never hardcode colors, border radius, spacing, or typography.** Use design tokens and generate Chakra semantic token style props (`bg="bg.default"`, not `bg="#ffffff"`).

### 3. Prevent Text and Content Overflow
**Never allow content to overflow its parent.** Set appropriate constraints, use `fill_container` widths, and verify with `pencil_snapshot_layout(problemsOnly: true)`.

### 4. Visually Verify Every Section
**Never skip screenshots.** Take `pencil_get_screenshot` after each section and analyze for alignment, spacing, and visual issues.

### 5. Reuse Existing Assets (Logos, Icons, Images)
**Never generate a new logo when one exists.** Search the document and copy existing assets with `C()` instead of regenerating.

### 6. Always Load the `frontend-design` Skill
**Never design without aesthetic direction.** Load the `frontend-design` skill first to get bold, intentional design guidelines and avoid generic AI aesthetics.

## Workflow

### Starting a New Design

```
0. Load `frontend-design` skill   -> Get aesthetic direction
1. pencil_get_editor_state        -> Understand file state
2. pencil_batch_get (reusable)    -> Discover components
3. pencil_get_variables           -> Read design tokens
4. pencil_get_guidelines          -> Get design rules
5. pencil_batch_design            -> Build the design
6. pencil_get_screenshot          -> Verify visually
7. pencil_snapshot_layout         -> Check for problems
```

### Design-to-Code

1. Load the `frontend-design` skill
2. Call `pencil_get_guidelines` with topic `"code"`
3. Call `pencil_get_variables` to map tokens to Chakra semantic tokens
4. Read the design tree with `pencil_batch_get`
5. Map Pencil components to Chakra UI v3 compound components and project UI wrappers
6. Generate code using Chakra style props
7. Apply `frontend-design` guidelines for typography, color, motion

## Target Stack

When generating code from Pencil designs, this skill targets:

- **Framework**: React 19 + Vite 7 + TanStack Router
- **Styling**: Chakra UI v3 (style props via `@emotion/react`)
- **Components**: Chakra compound components + project wrappers in `src/components/ui/`
- **Language**: TypeScript
- **Icons**: react-icons (`LuX` prefix from `react-icons/lu`)
- **Variants**: Chakra Recipes (`defineRecipe`) and Slot Recipes (`defineSlotRecipe`)
- **Theme**: `createSystem` + `defineConfig` (`src/configs/theme/`)
- **React Version**: 19 (ref as prop, no `forwardRef`)

## File Structure

```
pencil-design/
├── SKILL.md                           # Main skill file with 6 rules
└── references/
    ├── design-system-component.md     # Rule 1: Component reuse workflow
    ├── variables-and-tokens.md        # Rule 2: Variable usage and Chakra token mapping
    ├── layout-and-text-overflow.md    # Rule 3: Overflow prevention
    ├── visual-vertification.md        # Rule 4: Screenshot verification
    ├── asset-reuse.md                 # Rule 5: Asset copying rules
    ├── design-to-code-workflow.md     # Complete code generation guide
    ├── chakra-mapping.md              # Quick-reference Pencil → Chakra mapping tables
    └── responsive-breakpoints.md      # Multi-artboard responsive patterns
```

## Example Usage

### Designing in Pencil

```typescript
// Discover available components
const components = await pencil_batch_get({
  filePath: "design.pen",
  patterns: [{ reusable: true }]
});

// Read design tokens
const tokens = await pencil_get_variables({ filePath: "design.pen" });

// Insert a component instance
btn = I("parentId", { type: "ref", ref: "button-primary", width: "fill_container" });

// Customize it
U(btn + "/label", { content: "Submit" });

// Verify
await pencil_get_screenshot({ filePath: "design.pen", nodeId: btn });
```

### Generating Code

```tsx
// The skill guides code generation to produce:

// ❌ Never this:
<div className="bg-[#3b82f6] rounded-[6px] p-[24px]">

// ✅ Always this:
<Box bg="blue.solid" borderRadius="l3" p={6}>
```

## Resources

- [Pencil Docs](https://docs.pencil.dev)
- [Pencil Prompt Gallery](https://www.pencil.dev/prompts)
- [Agent Skills Spec](https://agentskills.io)
- [Chakra UI v3](https://www.chakra-ui.com/docs)
- [react-icons](https://react-icons.github.io/react-icons)

