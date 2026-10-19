## What
- [change 1]
- [change 2]

## Files changed
- `path/file.ts` — [why]

## Design change protocol (UI PRs only)

Read [`docs/specs/design-invariants.md`](../docs/specs/design-invariants.md) §3 first. One line per answer.

- **Surface:** which page/surface? Link its file under `frontend/design/` (index: `frontend/DESIGN.md`).
- **Closest pattern:** which existing file did you copy? Path.
- **Primitives:** which `components/ui/*` and shared compositions? If none fit, stop — a new primitive is a separate PR.
- **States:** loading / empty / error / disabled / permission / mobile / light+dark.
- **New vocabulary:** none, or list the new color/radius/shadow/font/spacing/motion value and why the existing token is insufficient.
- **Contracts:** which of these changed — `frontend/design/*.md`, `frontend/DESIGN.md` index, `docs/AGENT_PAGE_REGISTRY.md`, testids, tests, locale catalogs?

## Next steps
- [ ] [follow-up if any]
