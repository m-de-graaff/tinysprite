# Contributing to tinysprites

Thank you for your interest — contributors are very welcome! This guide explains how to set up the project, develop changes, and submit pull requests.

---

## Code of Conduct

Be respectful, kind, and inclusive. If you experience or witness unacceptable behavior, please open an issue or contact a maintainer.

---

## Getting Started

### Prerequisites

- Node.js 20.x
- pnpm 9.x (install via `npm i -g pnpm`)
- Git

### Clone and install

```bash
git clone https://github.com/<your-organization-or-user>/tinysprites.git
cd tinysprites
pnpm install
```

### Build

Build all packages:

```bash
pnpm build
```

Or target specific workspaces:

```bash
pnpm -C packages/decoder build
pnpm -C packages/encoder build
```

### Local checks

Run project checks (decoder size budgets, encoding win, perf smoke):

```bash
pnpm run ci:check
```

The script fails fast with details if anything needs attention.

---

## Repository Structure

- `packages/decoder` — ultra‑small runtime (tree‑shakable; size budgets enforced)
- `packages/encoder` — Node/TS encoder and CLI
- `packages/editor` — web editor/preview (internal tooling)
- `examples/` — small integration demos (canvas, Phaser, Kontra)
- `test/` — tests and fixtures

---

## Development Guidelines

- Favor clarity and readability; TypeScript preferred.
- Optimize for gzipped size in `packages/decoder`.
- Keep optional features in separate entry points to preserve tree‑shaking.
- Avoid heavy dependencies (especially in `packages/decoder`).
- Update examples and docs when behavior changes.

Before opening a PR:

1. `pnpm build`
2. `pnpm run ci:check`
3. Manually verify examples if your change impacts rendering or output

### Style

- Use descriptive, full‑word names
- Prefer early returns and shallow nesting
- Comments explain “why”, not “what”
- Avoid TODO comments — implement or open an issue

---

## Commit Messages

Use Conventional Commits to keep history and release notes clean:

- `feat(decoder): add minimal profile exports`
- `fix(encoder): correct palette index overflow`
- `docs: clarify canvas scaling behavior`
- `chore: bump dev dependencies`

Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

---

## Pull Requests

- Keep PRs focused and reasonably small
- Link related issues and describe motivation and impact
- Include benchmarks/size numbers or screenshots when relevant
- Ensure CI is green and address review feedback promptly

Merges are typically squash‑merge for a clean history.

---

## Testing

Tests live in `test/`. If you add functionality, also add or update tests and fixtures where practical. Visual diffs and size/perf checks are covered by `pnpm run ci:check`.

---

## Releases

Releases are managed by maintainers via GitHub Actions. If proposing a release, mention the intended tag and highlights in your PR.

---

## How to Contribute

- Report bugs or propose features by opening issues
- Improve documentation and examples
- Tackle open issues labeled `good first issue` or `help wanted`

Thanks again for contributing!
