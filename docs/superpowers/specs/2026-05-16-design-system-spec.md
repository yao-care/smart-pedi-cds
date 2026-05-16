# Smart Pedi CDSS — Design System Spec

**Date**: 2026-05-16
**Status**: Approved (brainstorming session)
**Author**: collaborative brainstorming with Light

## Context

Over the past 24 hours, the project went through 5 rounds of design token thrash — cold blue → rose 350 → rose 15 → eucalyptus 155 — each rejected. A semantic audit then surfaced 8 separate token misuses (`selected` row bound to `risk-advisory-bg`, `current model` card bound to `risk-normal-bg`, etc.). The thrash and the misuses share one root cause: **the token system was never designed from first principles**. Tokens were added ad-hoc as needs arose, semantic boundaries were never enforced, and every visual change required hunting through every component for hardcoded bindings.

This spec replaces the existing token system with one designed up-front, intentionally minimal, with explicit semantic boundaries and a pattern library that leaves no room for borrowed-meaning errors.

## Design Principles

Three rules drive every downstream decision:

1. **Semantic-named, not visual-named.** Tokens describe *what they do*, not *what they look like*. `--accent`, not `--green-500`. Components ask "I need the brand color" — not "I need the green one".

2. **Single-context rule.** Each token has exactly one allowed context. `--warn` lives in alert / badge / form-error contexts only. It is **not** a generic "amber surface" available for borrowing.

3. **Borrow equals misuse.** When no token fits, do not borrow one that happens to look right visually. Either extend the pattern library or use `color-mix()` from `--accent` + `--bg`. Adding a new pattern is cheap; borrowing creates the audit findings that motivated this spec.

## Token System

### Source-of-truth tokens (7)

The entire visual system is parameterised by 7 tokens. Everything else — hover states, soft bgs, focus rings, muted text — is derived via `color-mix()` at the consumption site.

```css
/* Hex fallback (browsers without OKLCH) */
:root {
  --bg:       #fbf8f2;   /* page background */
  --surface:  #f5efe5;   /* card / modal / sticky header */
  --text:     #33291d;   /* primary type */
  --line:     #dccfb8;   /* border / divider */
  --accent:   #3d6b54;   /* brand interaction + "normal" status */
  --warn:     #b06d1a;   /* advisory + warning combined */
  --danger:   #b62b1f;   /* critical / error */
}

/* OKLCH (modern browsers — Chrome 111+ / Safari 16.4+) */
@supports (color: oklch(0 0 0)) {
  :root {
    --bg:       oklch(0.985 0.006 85);
    --surface:  oklch(0.965 0.008 75);
    --text:     oklch(0.22  0.015 60);
    --line:     oklch(0.86  0.012 65);
    --accent:   oklch(0.48  0.08  155);
    --warn:     oklch(0.55  0.12  65);
    --danger:   oklch(0.48  0.20  25);
  }
}
```

### Naming convention

- Tokens have no namespace prefix — they are *the* surface / text / line / brand color. No `--color-*` / `--bg-*` / `--state-*` namespaces.
- This is the entire color vocabulary. If a component thinks it needs a different color, the answer is `color-mix(var(--accent), var(--bg))` or extending the pattern library — never a new top-level token.

### What is **not** a token

| Concept | How it's expressed instead |
|---|---|
| `--accent-hover` | `color-mix(in srgb, var(--accent) 85%, black)` at the site |
| `--accent-soft` (selected bg) | `color-mix(in srgb, var(--accent) 10%, var(--bg))` |
| `--accent-light` (chip bg) | `color-mix(in srgb, var(--accent) 12%, var(--bg))` |
| `--text-muted` | `color-mix(in srgb, var(--text), var(--bg) 45%)` |
| `--text-subtle` | `color-mix(in srgb, var(--text), var(--bg) 60%)` |
| `--text-inverse` | `white` (literal) |
| `--focus-ring` | `color-mix(in srgb, var(--accent) 45%, transparent)` |
| `--danger-bg` | `color-mix(in srgb, var(--danger) 12%, var(--bg))` |
| `--warn-bg` | `color-mix(in srgb, var(--warn) 12%, var(--bg))` |
| `--normal-status` color | reuse `--accent` directly (brand green = healthy) |
| `--state-disabled-bg` | `color-mix(in srgb, var(--bg), var(--text) 5%)` |

### Risk levels

The medical CDSS keeps a 3-level alert hierarchy (was 4): **normal / warn / danger**. The previous `advisory` (amber hue 65) and `warning` (orange hue 70) were only 5° apart and clinically indistinguishable to users — they fold into a single `--warn`. The engine layer may keep 4 internal levels if it wants; UI renders them as 3.

| Engine level | UI token | Rationale |
|---|---|---|
| normal | `--accent` | "Healthy" maps cleanly to brand green |
| advisory | `--warn` | merged — visually indistinguishable from warning |
| warning | `--warn` | merged |
| critical | `--danger` | distinct red, AA contrast vs `--bg` |

## Component CSS Pattern Library (12)

All component CSS must compose from these 12 patterns. New components consult this library; if no pattern fits, the library is extended (with explicit naming and use case), never bypassed.

### 1. Button

```css
.btn-primary {
  background: var(--accent);
  color: white;
  border-radius: var(--radius-lg);
}
.btn-primary:hover  { background: color-mix(in srgb, var(--accent) 85%, black); }
.btn-primary:active { transform: translateY(1px); }

.btn-secondary {
  background: transparent;
  color: var(--text);
  border: 1.5px solid var(--line);
}
.btn-secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, var(--bg));
}

.btn-ghost { background: transparent; color: var(--accent); }
.btn-ghost:hover { background: color-mix(in srgb, var(--accent) 8%, var(--bg)); }

.btn-danger { background: var(--danger); color: white; }
```

### 2. Card / Surface

```css
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
}
```

### 3. Input / Form field

```css
input, textarea, select {
  background: var(--bg);
  border: 1.5px solid var(--line);
  color: var(--text);
  border-radius: var(--radius-md);
}
input:focus, textarea:focus, select:focus {
  border-color: var(--accent);
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px;
}
```

### 4. Selected / Active state

Single pattern for `.selected`, `.active`, `.is-current`, `.chosen`:

```css
.timeline-row.selected,
.option-btn.selected,
.tab.active,
.chip.active,
.is-current {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg));
  border-color: var(--accent);
  color: var(--accent);
}
```

### 5. Hover surface (non-CTA)

```css
.row:hover, .list-item:hover {
  background: color-mix(in srgb, var(--accent) 4%, var(--bg));
}
```

### 6. Risk / Status badge

```css
.badge--normal {
  background: color-mix(in srgb, var(--accent) 12%, var(--bg));
  color: var(--accent);
}
.badge--warn {
  background: color-mix(in srgb, var(--warn) 14%, var(--bg));
  color: var(--warn);
}
.badge--danger {
  background: color-mix(in srgb, var(--danger) 14%, var(--bg));
  color: var(--danger);
}
```

### 7. Text variants

```css
/* base: var(--text) directly */
.text-muted   { color: color-mix(in srgb, var(--text), var(--bg) 45%); }
.text-subtle  { color: color-mix(in srgb, var(--text), var(--bg) 60%); }
.text-inverse { color: white; }
```

### 8. Disabled

```css
button:disabled, input:disabled, select:disabled {
  background: color-mix(in srgb, var(--bg), var(--text) 5%);
  color: color-mix(in srgb, var(--text), var(--bg) 55%);
  cursor: not-allowed;
}
```

### 9. Modal backdrop

```css
.backdrop {
  background: color-mix(in srgb, var(--text) 50%, transparent);
  backdrop-filter: blur(6px);
}
```

### 10. Alert / inline notice

```css
.alert--warn {
  background: color-mix(in srgb, var(--warn) 10%, var(--bg));
  border-left: 3px solid var(--warn);
  color: var(--text);
}
.alert--danger {
  background: color-mix(in srgb, var(--danger) 10%, var(--bg));
  border-left: 3px solid var(--danger);
  color: var(--text);
}
```

### 11. Tab underline (active)

```css
.tab.active {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
}
```

### 12. Focus ring (global)

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent);
}
```

## Anti-patterns (PR review must catch)

| ✗ Forbidden | Why | ✓ Use instead |
|---|---|---|
| `.selected { background: color-mix(var(--warn), ...) }` | `--warn` is alert semantic, not "this is chosen" | Pattern #4 (selected state) |
| `.chip--category { background: color-mix(var(--danger), ...) }` | category chip is not "danger" | Pattern #6 (badge) with `--accent` |
| `.row.is-current { background: var(--warn-bg-anything) }` | no namespace borrowing | Pattern #4 |
| `background: #f0a8bd;` | hardcoded hex | always token + color-mix |
| `color-mix(rgba(...), transparent)` | rgba on transparent doesn't compose cleanly | OKLCH alpha or direct token |
| `--accent` on form error / validation | `--accent` is brand + normal, not error | `--danger` |
| Inline OKLCH literal in component CSS | bypasses token system | put in tokens.css or use color-mix from existing |

## PR review checklist (3 rules)

Memorisable:

1. **No hardcoded color in component CSS.** Every color is `var(--bg/surface/text/line/accent/warn/danger)` or a `color-mix()` of them.
2. **`--warn` and `--danger` only in alert / badge / validation / status badge contexts.** Selected / hover / focus / chip — always `color-mix(var(--accent), ...)`.
3. **No new colors at the component level.** If no pattern fits, extend the pattern library in this spec — do not invent a new color recipe inline.

## Out of scope (explicit)

- **Typography tokens** — `--text-caption` through `--text-display` (9 sizes) remain as-is.
- **Spacing tokens** — `--space-1` through `--space-12` + `--space-3-5` remain.
- **Shadow / radius tokens** — keep existing 4-step shadow + 6-step radius.
- **Dark mode** — not in this spec. Future work: redefine the 7 source tokens under `[data-theme="dark"]`; pattern library is automatically dark-compatible because everything is `color-mix`-derived.
- **Component structure** — `Button.svelte`, `Modal.svelte` etc. structure / behavior is untouched; only their CSS color bindings change.
- **PDF (jsPDF)** — jsPDF uses literal hex, doesn't read CSS tokens. Color sync deferred.
- **Mermaid diagrams** — CLAUDE.md mandates hex for Mermaid; out of scope.

## Affected files (estimated)

| Change | Files | What |
|---|---|---|
| Rewrite | `src/styles/tokens.css` (1) | Collapse ~30 tokens to 7 source-of-truth |
| Rewrite | `src/styles/global.css` (1) | `:focus-visible` to new color-mix |
| Sweep | ~30 `.svelte` / `.astro` | Replace `var(--color-accent-*)`, `var(--bg-*)`, `var(--state-*)` etc. with new token names or color-mix |
| Fix misuse | 8 audit findings | Apply pattern library bindings |
| New file | `docs/superpowers/design-system.md` (1) | Pattern library + PR checklist, version-controlled |

Implementation plan to be produced by the `writing-plans` skill following this spec.

## Migration notes for the implementation plan

- The old `--color-accent-hover` etc. tokens will disappear. A bash sweep can map them mechanically:
  - `var(--color-accent)` → `var(--accent)`
  - `var(--color-accent-hover)` → `color-mix(in srgb, var(--accent) 85%, black)`
  - `var(--color-accent-soft)` → `color-mix(in srgb, var(--accent) 10%, var(--bg))`
  - `var(--color-accent-light)` → `color-mix(in srgb, var(--accent) 12%, var(--bg))`
  - `var(--color-accent-strong)` → `color-mix(in srgb, var(--accent) 85%, black)`
  - `var(--color-text-base)` → `var(--text)`
  - `var(--color-text-muted)` → `color-mix(in srgb, var(--text), var(--bg) 45%)`
  - `var(--color-text-subtle)` → `color-mix(in srgb, var(--text), var(--bg) 60%)`
  - `var(--color-text-inverse)` → `white`
  - `var(--bg-base)` → `var(--bg)`
  - `var(--bg-surface)` → `var(--surface)`
  - `var(--bg-muted)` — context-dependent:
    - In disabled / placeholder / progress-track contexts → `color-mix(in srgb, var(--bg), var(--text) 5%)`
    - In card / panel surface contexts → `var(--surface)`
  - `var(--border-default)` → `var(--line)`
  - `var(--border-strong)` → `color-mix(in srgb, var(--line), var(--text) 25%)`
  - `var(--color-risk-normal)` → `var(--accent)`
  - `var(--color-risk-normal-bg)` → `color-mix(in srgb, var(--accent) 12%, var(--bg))`
  - `var(--color-risk-advisory)` → `var(--warn)`
  - `var(--color-risk-advisory-bg)` → `color-mix(in srgb, var(--warn) 14%, var(--bg))`
  - `var(--color-risk-warning)` → `var(--warn)`
  - `var(--color-risk-warning-bg)` → `color-mix(in srgb, var(--warn) 14%, var(--bg))`
  - `var(--color-risk-critical)` → `var(--danger)`
  - `var(--color-risk-critical-bg)` → `color-mix(in srgb, var(--danger) 14%, var(--bg))`
  - `var(--state-selected-bg)` → `color-mix(in srgb, var(--accent) 10%, var(--bg))`
  - `var(--state-hover-surface)` → `color-mix(in srgb, var(--accent) 4%, var(--bg))`
  - `var(--state-focus-ring)` → `color-mix(in srgb, var(--accent) 45%, transparent)`
  - `var(--state-disabled-bg)` → `color-mix(in srgb, var(--bg), var(--text) 5%)`
  - `var(--state-disabled-text)` → `color-mix(in srgb, var(--text), var(--bg) 55%)`
- The 8 audit findings get manually overridden during the sweep to apply the correct pattern (selected / current / chip / format-badge):
  - `QuestionnaireModule.svelte:330-331` — selected option pattern
  - `NormsManager.svelte:251` — `tr.custom` row uses selected pattern
  - `ModelManager.svelte:355-357 + 549-551` — current model / version uses selected pattern
  - `RecommendationsManager.svelte:481-483` — override badge uses accent-light bg + accent text
  - `AssessmentsTab.svelte:170-171` — demo mode badge uses accent-light
  - `LaunchSelector.svelte:159-160` — EHR icon uses accent-light
  - `ContentViewer.svelte:160-161` — questionnaire format badge uses accent-light + accent-strong text
- Shadow tokens (`--shadow-sm/md/lg/xl`) stay as-is — they were already explicitly out of scope of the color rework.

## Verification

After implementation:

1. `pnpm check` — 0 errors / 0 warnings.
2. `grep -rE "#[0-9a-fA-F]{3,8}" src --include="*.svelte" --include="*.astro" --include="*.css"` — only matches in tokens.css fallback block and intentional non-token contexts (SVG palettes for SERIES_COLORS, etc.). No hex sneaking into component CSS.
3. `grep -rE "rgba\([0-9]" src` — empty (no leftover RGB).
4. Visual regression on key pages: home, `/assess/?` step 1, `/result/?id=`, `/workspace/`, `/settings/` system guide, `/education/` list, `/history/` compare.
5. Re-run the token misuse audit — expect 0 findings.
6. Hard-refresh PWA on iOS + Android, confirm theme-color and icon still apply.
