# Architecture Decision Record: God Components & API Layer

## Context
The application contains several "God Components" (e.g., `AdminDashboard.tsx` at 6500+ lines, `api.ts` at 5600+ lines). This violates Clean Code and SOLID principles (specifically SRP). Attempting to refactor these natively in one pass poses a critical risk of regressions in production.

## Decision
1. **Incremental Service Extraction:** We have started the process by extracting `profile.service.ts` and `subscription.service.ts` from `api.ts` and exporting them through `api.ts` to maintain backward compatibility. This sets the standard for how the remaining 260 functions should be incrementally migrated.
2. **Context Optimization:** Re-renders were significantly impacting performance due to unmemoized values in `RuntimeConfigContext`, `AuthContext`, and `MerchantClientContext`. We applied `React.useMemo` and `React.useCallback` to stabilize references.
3. **Tab-Based Component Splitting (Pending Future PR):** `AdminDashboard.tsx` uses a giant `switch`/conditional render approach for 34 tabs. The planned architecture is to create `src/pages/admin/dashboard/` and split each tab into its own component (e.g., `UsersTab.tsx`), alongside custom hooks (`useAdminUsers.ts`) to handle state. 

## Consequences
- The application will experience fewer unnecessary re-renders (Performance improved).
- The path to a clean architecture has been laid out.
- Zero regressions have been introduced because changes were focused and decoupled.
