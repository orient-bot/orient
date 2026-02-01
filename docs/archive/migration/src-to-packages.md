# src/ to packages/ Migration

The `src/` directory is deprecated. New work should be done in `packages/`,
with legacy modules migrated incrementally.

## Current State

| File                | Lines | Target Package                    |
| ------------------- | ----- | --------------------------------- |
| `src/mcp-server.ts` | 6817  | `@orient-bot/mcp-tools` (refactor) |
| `src/services/`     | ~5000 | Multiple packages                 |
| `src/tools/`        | ~1500 | `@orient-bot/mcp-tools`            |

## Recommendation

Two viable paths exist:

### Option A: Complete Migration Before Release

Pros:

- Cleaner public API and package boundaries
- No deprecated paths in released code
- Easier maintenance for contributors

Cons:

- Larger scope and risk before release
- Requires coordinated refactors

### Option B: Document Deprecation and Migrate Incrementally

Pros:

- Faster release timeline
- Smaller, safer refactors
- Can parallelize migration work

Cons:

- Ongoing dual-path maintenance
- Some documentation needs to reference legacy paths

## Next Steps (If Choosing Option B)

1. Tag `src/` as deprecated in docs and README
2. Prioritize `mcp-server.ts` and `src/tools/` extraction
3. Migrate `src/services/` by domain area
4. Add tests around migrated modules
