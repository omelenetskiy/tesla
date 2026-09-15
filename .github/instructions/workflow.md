# Agent Workflow

Future Copilot agents should treat this directory as the project's persistent engineering specification.

## Required workflow for non-trivial tasks

### 1. Understand
Inspect the repository structure, relevant routes, services, components, migrations, tests, and current implementation. Do not guess where behavior lives.

### 2. Read context
Read the relevant files in `.github/instructions/` before planning. At minimum use `architecture.md`, `coding-rules.md`, and the task-specific files.

### 3. Search
Find existing components, utilities, API clients, domain models, repositories, pages, migrations, and tests that already solve part of the task. Trace symbols to definitions and usages.

### 4. Plan
Determine what must change, which layer owns the change, which existing abstraction can be reused, what states/units/security constraints apply, and which files must remain untouched.

### 5. Implement
Make the smallest appropriate implementation. Preserve established patterns, public APIs, nullability, and provider boundaries. Do not make speculative architectural changes or redesign unrelated screens.

### 6. Validate
Run type checking, linting, and relevant tests. For data/API work, validate migrations, authorization, units, error paths, and response contracts. For UI work, inspect responsive and accessible states.

### 7. Review
Check mobile and desktop behavior; loading, empty, error, stale, partial, unavailable, and sleeping/offline states; keyboard/accessibility behavior; performance; security; and data provenance.

### 8. Final review
Confirm the implementation follows `product.md`, `architecture.md`, `frontend.md`, `design.md`, `data-model.md`, `tesla-fleet-api.md`, and `coding-rules.md`. Report what changed, what was validated, and any known limitations.

## Conflicts and ambiguity

If a task conflicts with these instructions:

1. identify the conflict;
2. inspect the existing implementation and tests;
3. prefer consistency with the established architecture and repository conventions;
4. avoid silently breaking behavior;
5. ask for clarification only after repository evidence cannot resolve the ambiguity.

For Tesla API behavior, use official Tesla Fleet documentation rather than assumptions. Update the relevant context file when an established project rule changes; do not create duplicate instruction files.
