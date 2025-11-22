# Tab State Persistence Walkthrough

## Changes Implemented

### Routes
- **Invite Route** (`src/routes/_auth/shops/$shopId/invite/index.tsx`): Added `zod` schema validation for `tab` query parameter (`send` | `manage` | `staff`).
- **ShopDetail Route** (`src/routes/_auth/shops/$shopId/index.tsx`): Added `zod` schema validation for `tab` query parameter (`info` | `staff`).

### Components
- **InviteShopMember** (`src/components/features/Shop/Invite/index.tsx`): Updated to use `useSearch` for reading tab state and `useNavigate` for updating URL on tab change.
- **ShopDetail** (`src/components/features/Shop/ShopDetail/index.tsx`): Updated to use `useSearch` for reading tab state and `useNavigate` for updating URL on tab change.

## Verification Results

### Manual Verification Steps
1. **Invite Page**:
   - Navigate to `/shops/{id}/invite`.
   - Click on "招待管理" (Manage) tab.
   - URL should update to `.../invite?tab=manage`.
   - Refresh the page.
   - "招待管理" tab should remain selected.

2. **Shop Detail Page**:
   - Navigate to `/shops/{id}`.
   - Click on "スタッフ" (Staff) tab.
   - URL should update to `...?tab=staff`.
   - Navigate to another page (e.g., Invite page).
   - Click browser "Back" button.
   - "スタッフ" tab should be selected.

### Automated Tests
- Run `pnpm test` to ensure no regressions.

## Next Steps
- None. The feature is implemented as requested.
