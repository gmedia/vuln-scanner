# Row actions in tables & card lists (v1)

**Status:** active rule — **enforced** (not a proposal).
**Applies to:** any row-level control in a table's last column, and any mobile card's action area.
**Summary rule:** [`AGENTS.md`](../../AGENTS.md) § Design system item 5.

---

## 1. Why this exists (evidence)

The Table kit makes right alignment an **explicit opt-in**:

- `frontend/src/components/ui/Table.tsx` — `TableHead` hard-codes `text-left`; `TableCell` sets no `text-align`.

An audit of every action column in the SPA found them split between aligned and left-aligned. Fixes: **#932** (Guard enroll tokens), **#933** (Host suspicious files), **#935** (six remaining columns + mobile rows).

Two traps were found **in practice**, not in theory:

1. **`text-right` on the cell can be a no-op.** When the cell's content is a block-level flex wrapper (e.g. `<div className="flex flex-wrap gap-2">`), the wrapper fills the cell, so alignment is governed by `justify-content`, not `text-align`. `text-right` alone leaves the controls flush left. Fix: `justify-end` on the wrapper.
2. **A menu trigger nested inside a dropdown item unmounts.** `AlertDialogTrigger asChild` inside a `DropdownMenuItem` destroys the dialog before it can open, and breaks focus. Fix: a **sibling controlled** `AlertDialog`.

---

## 2. Which control to use

Count the actions **available on that row after permissions and status are applied** — not the component's maximum. A row that conditionally shows one action must not get a one-item menu.

| Row shows | Desktop | Mobile card |
|---|---|---|
| 1 command | inline `Button`; icon-only only if unambiguous **and** `aria-label` present | labeled button, target ≥ 44px |
| 2 commands on a primary triage page | both visible | both labeled |
| 2 commands on an admin CRUD page, or ≥ 3 secondary commands | `…` `DropdownMenu` | `…` `DropdownMenu`, trigger ≥ 44px |
| 1 primary + secondaries | primary visible, rest in `…` | primary labeled + `…` |
| any `Select` / input / disclosure toggle | **outside** the menu; the table above governs the commands only | same |

**Never** wrap a lone remaining action in a menu. **Destructiveness decides confirmation, not menu membership.**

Worked example — Admin invoices, one table, four shapes:

| Status | Actions | Control |
|---|---|---|
| `draft` | Send, Mark paid, Void | `…` menu (3) |
| `sent` | Print, PDF, Mark paid, Void | `…` menu (4) |
| `paid` | Print, PDF | 2 visible buttons |
| `void` | — | empty cell |

---

## 3. Alignment (mandatory)

- **Desktop:** `text-right` on **both** the action `TableHead` and the action `TableCell`.
- An empty spacer header (`<TableHead className="w-[4rem]" />`) needs no alignment — there is no text.
- **If the cell's content is a block-level flex/grid wrapper**, `text-right` is a no-op → put `justify-end` on the wrapper, or wrap the trigger in `<div className="flex justify-end">`.
- **Mobile card action row:** `justify-between` (status left, action right) or `justify-end`. When the wrapper is `flex-col` (stacked), add `items-end` — with the default `align-items: stretch` a full-width button fills the row and a fixed-width trigger falls to the **start**.
- **Full-width stacked buttons (`w-full`) are a valid exception** on triage surfaces (e.g. `GuardAgentCard`). `width: 100%` is unaffected by `align-items`, so a full-width row still needs `items-end` for any non-full-width sibling.
- **One component rendering both surfaces:** take a `desktop` boolean prop and branch in JS. Do **not** use `sm:` classes — the mobile card is `md:hidden` and the table is `hidden md:block`, so `sm:` mis-fires between **640–767px**.

---

## 4. Menus

- **Trigger:** ghost `Button` `size="sm"`, `MoreHorizontal` icon, `aria-label` from an `actionsMenu` key, stable `data-testid`.
  - desktop compact: `h-9 w-9 p-0`
  - mobile: `h-11 w-11 min-h-11 min-w-11 p-0`
- **Content:** `<DropdownMenuContent align="end" className="w-48">`.
- **Items use `onSelect`, never `onClick`.**
- **Destructive item last**, `variant="destructive"`, with a `DropdownMenuSeparator` before it.
- **Never nest `AlertDialogTrigger` (or any dialog) inside a `DropdownMenuItem`.** Use a **sibling controlled `AlertDialog`**: the item calls `setTarget(row)`, and one dialog per component renders outside the menu, driven by `open={target !== null}` / `onOpenChange`. Lift the state **above the `.map`**.
- **Never put in a menu:** `Select` or other inputs, inline-edit Save/Cancel, disclosure toggles (expand/collapse), or primary navigation. A **secondary** `Link` may be a `DropdownMenuItem asChild` (see `AssetRowMenu`).

---

## 5. Confirmation

| Action kind | Treatment |
|---|---|
| Irreversible (delete, void, revoke, ignore, disable) | `AlertDialog` confirmation |
| Reversible (e.g. Host Quarantine ↔ Restore) | stays **one-click** — do not add friction to triage |
| Outcome reporting | `sonner` toast **after** the action |

A toast is not a safety mechanism. The confirm action uses `className={buttonVariants({ variant: "destructive" })}`.

---

## 6. i18n & testids

- The trigger's `aria-label` comes from an `actionsMenu` key added to **both** `src/locales/en/` and `src/locales/id/` — `src/test/i18n.test.ts` enforces key parity per namespace.
- **Keep the trigger's existing `data-testid` stable.** Add a distinct testid for the confirm action.
- e2e testids are **frozen** (see `AGENTS.md`).

---

## 7. Known-good references

| Pattern | File |
|---|---|
| Dropdown menu (canonical) | `frontend/src/components/uptime/MonitorActionsMenu.tsx` |
| Visible primary + `…` menu | `frontend/src/pages/Schedules.tsx` (`ScheduleRowActions`) |
| Sibling controlled confirm dialog | `frontend/src/components/status/StatusIncidentActions.tsx` |
| Mobile card action row | `frontend/src/components/guard/GuardTokenList.tsx` |
| Full-width mobile buttons (allowed) | `frontend/src/components/guard/GuardAgentCard.tsx` |
| `DropdownMenuItem asChild` + `Link` | `frontend/src/components/assets/AssetItemChrome.tsx` |

---

## 8. Checklist

- [ ] `text-right` on action head **and** cell — or `justify-end` if the cell wraps a block-level flex
- [ ] a single available action is **not** wrapped in a menu
- [ ] `Select` / inputs / disclosure toggles are **outside** the menu
- [ ] destructive item last, `variant="destructive"`, separator before it
- [ ] confirmation **only** for irreversible actions
- [ ] dialog is a **sibling controlled** `AlertDialog`, never a trigger nested in a menu item
- [ ] menu items use `onSelect`, not `onClick`
- [ ] trigger has `aria-label`; `actionsMenu` present in **both** `en` and `id`
- [ ] mobile trigger ≥ 44px; both surfaces branch on a `desktop` prop, not `sm:`
- [ ] `tsc --noEmit` + `eslint` clean; vitest green; **visually checked at 1440×900 and 393×851**

---

*Keep this file updated when the pattern changes. Kit rules live in [`shadcn-ui-migration.md`](shadcn-ui-migration.md).*
