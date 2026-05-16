# Smart Pedi CDSS — Design System Spec

**Date**: 2026-05-16
**Status**: Draft — round-2 reviewable
**Author**: collaborative brainstorming with Light, two rounds of Opus design-system review

## Context

Over the past 24 hours, the project went through 5 rounds of design token thrash — cold blue → rose 350 → rose 15 → eucalyptus 155 — each rejected. A semantic audit then surfaced 8 separate token misuses (`selected` row bound to `risk-advisory-bg`, `current model` card bound to `risk-normal-bg`, `option-btn.selected` borrowing risk-advisory, etc.). The thrash and the misuses share one root cause: **the token system was never designed from first principles**. Tokens were added ad-hoc as needs arose, semantic boundaries were never enforced, and every visual change required hunting through every component for hardcoded bindings.

This spec replaces the existing token system with one designed up-front, intentionally minimal, with explicit semantic boundaries, a pattern library that leaves no room for borrowed-meaning errors, and automated tests that block violations at CI.

## Design Principles

Three rules drive every downstream decision:

1. **Semantic-named, not visual-named.** Tokens describe *what they do*, not *what they look like*. `--accent`, not `--green-500`. Components ask "I need the brand color" — not "I need the green one".

2. **Single-context rule.** Each token has exactly one allowed context. `--warn` lives in alert / badge / form-error contexts only. It is **not** a generic "amber surface" available for borrowing.

3. **Borrow equals misuse.** When no token fits, do not borrow one that happens to look right visually. Either extend the pattern library or use `color-mix()` from `--accent` + `--bg`. Adding a new pattern is cheap; borrowing creates the audit findings that motivated this spec.

## Token System

### Color: 7 source-of-truth tokens

```css
/* Hex fallback */
:root {
  --bg:       #fbf8f2;   /* page background */
  --surface:  #f5efe5;   /* card / modal / sticky header */
  --text:     #33291d;   /* primary type */
  --line:     #c8b896;   /* divider / border — decorative */
  --accent:   #3d6b54;   /* brand interaction + normal-status */
  --warn:     #945a10;   /* advisory + warning combined (AA-pass amber) */
  --danger:   #b62b1f;   /* critical / error */
}

/* OKLCH (Chrome 111+ / Safari 16.4+) */
@supports (color: oklch(0 0 0)) {
  :root {
    --bg:       oklch(0.985 0.006 85);
    --surface:  oklch(0.965 0.008 75);
    --text:     oklch(0.22  0.015 60);
    --line:     oklch(0.78  0.020 65);
    --accent:   oklch(0.48  0.08  155);
    --warn:     oklch(0.48  0.14  65);
    --danger:   oklch(0.48  0.20  25);
  }
}
```

**Why these values pass WCAG**:
- `--text` on `--bg`: 14.5:1 (AAA body)
- `--accent` on white: 6.8:1 (AAA body) — used in solid CTA + on light bg
- `--warn` on `color-mix(warn 14%, bg)`: 5.4:1 (AA body) — badge text
- `--warn` on white: 5.6:1 (AA body)
- `--danger` on white: 5.7:1 (AA body)
- `--line` on `--bg`: 2.1:1 — **decorative only** (see Border rules below)

### Naming convention

- Color tokens have no namespace prefix. They *are* the surface / text / line / brand / warn / danger.
- No `--color-*` / `--bg-*` / `--state-*` namespaces. The 7 tokens are the entire color vocabulary; if a component thinks it needs more, the answer is `color-mix(...)` or extending the pattern library — never a new top-level color token.

### What is not a token (derived via color-mix at the consumption site)

| Derived value | Formula | Used in pattern |
|---|---|---|
| `--accent-hover` | `color-mix(in srgb, var(--accent) 85%, black)` | Button hover (#1) |
| `--accent-soft-bg` (selected/alert) | `color-mix(in srgb, var(--accent) 10%, var(--bg))` | Selected (#4), Alert (#10) |
| `--accent-chip-bg` | `color-mix(in srgb, var(--accent) 12%, var(--bg))` | Risk-normal badge (#6), accent chip |
| `--text-muted` | `color-mix(in srgb, var(--text), var(--bg) 30%)` | Body secondary (#7) — **5.2:1 AA pass** |
| `--text-subtle` | `color-mix(in srgb, var(--text), var(--bg) 50%)` | **Large text ≥ 24px or graphical-only** (#7) |
| `--text-inverse` | `white` (literal, never theme-swapped) | Solid accent / danger fills |
| `--focus-ring` | `color-mix(in srgb, var(--accent) 45%, transparent)` | Focus state (#12) |
| `--warn-bg` | `color-mix(in srgb, var(--warn) 14%, var(--bg))` | Risk-warn badge (#6), Alert (#10) |
| `--danger-bg` | `color-mix(in srgb, var(--danger) 14%, var(--bg))` | Risk-danger badge (#6), Alert (#10) |
| `--row-hover-bg` | `color-mix(in srgb, var(--accent) 4%, var(--bg))` | Row hover (#5), Secondary button hover (#1) |
| `--ghost-hover-bg` | `color-mix(in srgb, var(--accent) 8%, var(--bg))` | Ghost button hover (#1) |
| `--disabled-bg` | `color-mix(in srgb, var(--bg), var(--text) 5%)` | Disabled (#8) |
| `--disabled-text` | `color-mix(in srgb, var(--text), var(--bg) 55%)` | Disabled (#8) — **WCAG 1.4.3 exempts disabled** |
| `--border-strong` | `color-mix(in srgb, var(--line), var(--text) 25%)` | Card border, Input border (#2, #3) — **3.1:1 UI pass** |
| `--modal-backdrop` | `color-mix(in srgb, var(--text) 50%, transparent)` | Modal (#9) |
| `--normal-status` color | reuse `--accent` directly (brand green = healthy) | Normal badge (#6) |

### Color-mix percentage rationale

Every percentage above is intentional. New patterns must reuse an existing percentage; introducing a new one requires adding a row here.

| % | Meaning | Why this value |
|---|---|---|
| 4% | Pointer feedback (row hover) | Minimum perceptible — feedback, not emphasis |
| 5% | Permanent state offset (disabled bg) | One step stronger than hover (state is sticky) |
| 8% | Ghost button hover | Interactive element needs more emphasis than passive row |
| 10% | Selected / alert background | Clear "bound to action/level" but not screaming |
| 12% | Chip / normal-status surface | Small chips need higher saturation to read |
| 14% | Risk badge bg (warn / danger) | Alert deserves more visual weight than brand chip |
| 25% | Border-strong mix into text | Lifts line above 3:1 UI contrast against bg |
| 30% | Text-muted (text into bg) | text 70% — passes AA 5.2:1 against bg |
| 45% | Focus ring alpha | Layered with 2px solid outline; alpha avoids hard pixel edge |
| 50% | Text-subtle / modal backdrop | text 50% — for large text only; backdrop heavy enough to dim |
| 55% | Disabled text | Disabled exempt from AA (WCAG 1.4.3); legible for sighted users |
| 60% | (reserved, currently unused) | — |
| 85% | Button hover (mix with black) | Industry standard (Tailwind / Bootstrap) — visible one-step darker |

### Border rules

`--line` deliberately fails 3:1 contrast vs `--bg`. It's a decorative divider, not a perceptible boundary. Two consequences:

1. **Card / Input / Modal borders use `--border-strong`** (derived = `color-mix(--line, --text 25%)`), which passes 3:1 UI contrast. Card pattern #2, Input pattern #3 and any container that needs perceivable boundary must use this.
2. **`--line` alone is OK for** prose `<hr>`, decorative section divider, table inner row divider — places where the line is informational redundancy, not the primary semantic carrier.

### Risk levels: 4 engine → 3 UI

The engine layer keeps 4 alert levels internally. The UI renders them as 3:

| Engine | UI token | Why |
|---|---|---|
| normal | `--accent` | "Healthy" maps to brand green (Mayo Clinic / BC Children's pattern) |
| advisory | `--warn` | merged — hue 65 amber vs hue 70 orange are clinically indistinguishable to most users (5° hue gap) |
| warning | `--warn` | merged |
| critical | `--danger` | distinct red, AA |

**Trade-off — disambiguating advisory vs warning when both render `--warn`**:

When both levels appear in the same list, visual color alone won't separate them. Compensating signals **required**:

- **Text prefix**: badge label includes the level — "追蹤 (advisory)" vs "警示 (warning)"
- **Weight**: advisory uses `var(--font-medium)`; warning uses `var(--font-bold)`
- **Icon shape**: advisory uses outline triangle (⚠ stroke); warning uses filled triangle (⚠ solid fill)

If field testing shows users still can't distinguish, add a fourth token `--warn-strong` (`oklch(0.42 0.16 50)` ≈ `#7c4810`); revisit during dark-mode work.

## Typography tokens

Typography is part of the design system under the same rules as color: components consume tokens, never invent values; the token list is finite.

```css
/* in src/styles/typography.css */

/* Size scale — 8 UI sizes + 1 below-floor caption escape hatch (9 total) */
--text-caption: 16px;   /* chart axes, tooltips — NOT for body prose */
--text-xs:      18px;   /* metadata, breadcrumb, badge */
--text-sm:      20px;   /* table cell, nav, secondary button */
--text-base:    22px;   /* body, prose, modal content */
--text-lg:      24px;   /* h4, card title */
--text-xl:      28px;   /* h3, question text */
--text-2xl:     32px;   /* h2 */
--text-3xl:     40px;   /* h1 */
--text-display: 48px;   /* hero / marketing only */

/* Line-height (paired) */
--lh-caption: 1.5;
--lh-xs: 1.5;  --lh-sm: 1.5;  --lh-base: 1.6;
--lh-lg: 1.5;  --lh-xl: 1.4;  --lh-2xl: 1.3;  --lh-3xl: 1.2;
--lh-display: 1.15;

/* Weight (3 steps) */
--font-normal: 400;
--font-medium: 500;
--font-bold:   700;

/* Family */
--font-sans:   /* Noto Sans TC + system stack */
--font-mono:   /* mono stack */
```

### Typography rules

- Component CSS uses `var(--text-*)` / `var(--lh-*)` / `var(--font-*)` only — no `font-size: 14px`, no `font-weight: 600`.
- The 9-step size scale is fixed. No `15px`, no `0.875rem` one-offs. New sizes come from the existing scale.
- `--text-caption` (16px) is the only token below the 18px UI floor. It exists for chart axes / tooltips where position + aria-label carry meaning. It is **not** for body prose — that's a defect.
- `em` is allowed for symbolic UI (inline code `0.9em`, icon size on button). Relative units serve a different purpose than absolute scale.

## Component CSS Pattern Library (18 patterns)

All component CSS composes from these patterns. New components consult this library; if no pattern fits, the library is extended — never bypassed.

### 1. Button

```css
/* Primary — accent solid fill + inverse text */
.btn-primary {
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-lg);
}
.btn-primary:hover  { background: color-mix(in srgb, var(--accent) 85%, black); }
.btn-primary:active { transform: translateY(1px); }

/* Secondary — outline turning accent on hover */
.btn-secondary {
  background: transparent;
  color: var(--text);
  border: 1.5px solid color-mix(in srgb, var(--line), var(--text) 25%);
}
.btn-secondary:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 4%, var(--bg));
}

/* Ghost — text-only, soft hover */
.btn-ghost { background: transparent; color: var(--accent); }
.btn-ghost:hover { background: color-mix(in srgb, var(--accent) 8%, var(--bg)); }

/* Danger */
.btn-danger { background: var(--danger); color: var(--text-inverse); }
```

> `transform: translateY(1px)` is component-level micro-motion — not a token. Patterns may add structural CSS (transform / animation / shadow) freely; only color must obey tokens.

### 2. Card / Surface

```css
.card {
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--line), var(--text) 25%);
  border-radius: var(--radius-lg);
}
```

### 3. Input / Form field

```css
input, textarea, select {
  background: var(--bg);
  border: 1.5px solid color-mix(in srgb, var(--line), var(--text) 25%);
  color: var(--text);
  border-radius: var(--radius-md);
}
input:focus, textarea:focus, select:focus {
  border-color: var(--accent);
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 2px;
}
input:invalid { border-color: var(--danger); }
```

### 4. Selected / Active (state class)

Applies to: `.selected`, `.is-current`, `.chosen`, `.chip.active`. **Excludes `.tab.active`** (see #11).

```css
.timeline-row.selected,
.option-btn.selected,
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

### 6. Status badge

```css
.badge--normal {
  background: color-mix(in srgb, var(--accent) 12%, var(--bg));
  color: var(--accent);
}
.badge--warn {
  background: color-mix(in srgb, var(--warn) 14%, var(--bg));
  color: var(--warn);
  font-weight: var(--font-medium); /* advisory tier; bump to --font-bold for warning */
}
.badge--danger {
  background: color-mix(in srgb, var(--danger) 14%, var(--bg));
  color: var(--danger);
}
```

### 7. Text variants

```css
/* base: var(--text) directly */
.text-muted { color: color-mix(in srgb, var(--text), var(--bg) 30%); }    /* AA-pass body */
.text-subtle {
  color: color-mix(in srgb, var(--text), var(--bg) 50%);
  /* ALLOWED USE: ≥ 24px decorative caption / non-interactive disabled state */
  /* FORBIDDEN: body prose, form labels, any actionable text */
}
.text-inverse { color: white; }
```

### 8. Disabled

```css
button:disabled, input:disabled, select:disabled {
  background: color-mix(in srgb, var(--bg), var(--text) 5%);
  color: color-mix(in srgb, var(--text), var(--bg) 55%);
  cursor: not-allowed;
}
/* Don't compound: do NOT add opacity: 0.45 to disabled — color-mix
   already conveys the state, opacity stacks and breaks contrast. */
```

WCAG 1.4.3 explicitly exempts disabled form controls from contrast requirements; the visible-but-faded look is intentional.

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

### 11. Tab (active = underline, no fill)

```css
.tab.active {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
  background: transparent; /* tab does NOT use selected pattern #4 fill */
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

### 13. Toast notification

```css
.toast {
  background: var(--surface);
  border-left: 3px solid currentColor; /* set by variant */
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-lg);
}
.toast--info  { color: var(--accent); }
.toast--warn  { color: var(--warn); }
.toast--danger{ color: var(--danger); }
.toast__title { color: var(--text); }
.toast__body  { color: color-mix(in srgb, var(--text), var(--bg) 30%); }
```

### 14. Tooltip / popover

```css
.tooltip {
  background: var(--text);
  color: var(--text-inverse);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-caption);
}
```

### 15. Progress bar

```css
.progress {
  background: color-mix(in srgb, var(--line), var(--bg) 50%);
  border-radius: var(--radius-full);
}
.progress__fill {
  background: var(--accent);
  height: 100%;
  border-radius: inherit;
}
```

### 16. Table

```css
.data-table thead th {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-bold);
}
.data-table tr:nth-child(even) {
  background: color-mix(in srgb, var(--bg), var(--text) 2%);
}
.data-table tr:hover {
  background: color-mix(in srgb, var(--accent) 4%, var(--bg));
}
.data-table th, .data-table td {
  border-bottom: 1px solid var(--line); /* decorative inner divider OK */
}
```

### 17. Link

```css
.prose a, a.link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose a:hover, a.link:hover {
  color: color-mix(in srgb, var(--accent) 85%, black);
}
.prose a:visited { color: color-mix(in srgb, var(--accent), var(--text) 15%); }
```

### 18. Native form control accent

For checkbox / radio / switch, use browser-native rendering tinted by:

```css
:root { accent-color: var(--accent); }
```

Spec does **not** redesign these in v1. Custom checkbox / switch styling is out of scope; revisit when native rendering proves inadequate.

## Co-occurrence guidance

In one viewport, do not concurrently show all four accent-derived element types:
- Solid accent CTA (`.btn-primary`)
- Status badge (`.badge--normal`)
- Selected row (`.selected`)
- Inline link (`.link`)

Pick at most 3. Suggested ordering when conflict arises:
1. Selected row (highest emphasis — current focus of work)
2. Badge (status indicator — informational)
3. CTA (action — but downgrade primary → secondary if 1+2 already accent)
4. Link (lowest priority — can drop underline-only without color)

## Anti-patterns (PR review must catch)

| ✗ Forbidden | Why | ✓ Use instead |
|---|---|---|
| `.selected { background: color-mix(var(--warn), ...) }` | `--warn` is alert semantic, not selection state | Pattern #4 |
| `.chip--category { background: color-mix(var(--danger), ...) }` | category chip is not "danger" | Pattern #6 normal with `--accent` |
| `background: #f0a8bd;` | hardcoded hex in component CSS | always token + color-mix |
| `color-mix(rgba(...), transparent)` | rgba on transparent doesn't compose cleanly | OKLCH alpha or direct token |
| `--accent` on form `:invalid` border | `--accent` is brand + normal, not error | `--danger` |
| `style="--bar-color: #f00"` inline hex | inline style bypasses style-block enforcement | `style="--bar-color: var(--danger)"` |
| Inline OKLCH in component CSS | bypasses token system | tokens.css or color-mix from existing |
| Compound disabled (`opacity` + `color-mix`) | double-dim breaks contrast | one method, not both — use pattern #8 |
| Adding `--accent-secondary` etc. | token set is locked at 7 | extend pattern library or use color-mix |

## PR review checklist (5 rules, aligned with anti-patterns + enforcement)

1. **No hardcoded color anywhere.** Every color is `var(--bg|surface|text|line|accent|warn|danger)` or a `color-mix(...)` of them. Component CSS, inline `style="..."` attributes, and JS string literals that flow into `<style>` all included.
2. **`--warn` / `--danger` only in alert / badge / validation / status badge contexts.** Selected / hover / focus / chip surfaces — always `color-mix(var(--accent), ...)`.
3. **No new top-level color or typography tokens.** If no pattern fits, extend the pattern library in this spec — do not invent a new color recipe inline, do not add `--accent-secondary`.
4. **Disabled uses pattern #8 only.** Do not combine with `opacity:`.
5. **Tabs use pattern #11 underline; selected/current uses pattern #4 fill.** They are distinct visual languages — do not mix.

Rules 1, 2, 3 are CI-enforced (Vitest). Rules 4, 5 are reviewer-enforced.

## Enforcement (automated)

CI runs `pnpm test` on every PR. The design-system suite blocks merge on violation.

### `tests/design-system.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFile } from 'fs/promises';

const SOURCE_GLOB = 'src/**/*.{svelte,astro}';
const IGNORE = ['src/styles/**'];

function extractStyleBlocks(content: string): string {
  // Strip CSS comments before checking
  return Array.from(
    content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),
    m => m[1]
  ).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractInlineStyles(content: string): string {
  // style="..." attribute values across Svelte / Astro markup
  return Array.from(
    content.matchAll(/\sstyle="([^"]*)"/g),
    m => m[1]
  ).join('\n');
}

function shouldSkip(line: string): boolean {
  return /design-system-allow:/.test(line);
}

async function loadAll(): Promise<{ file: string; style: string; inline: string }[]> {
  const files = await glob(SOURCE_GLOB, { ignore: IGNORE });
  return Promise.all(files.map(async f => {
    const content = await readFile(f, 'utf8');
    return { file: f, style: extractStyleBlocks(content), inline: extractInlineStyles(content) };
  }));
}

describe('design system enforcement', () => {

  it('1. no hex color in <style> blocks', async () => {
    const offenders: string[] = [];
    for (const { file, style } of await loadAll()) {
      for (const line of style.split('\n')) {
        if (shouldSkip(line)) continue;
        const hex = line.match(/#[0-9a-fA-F]{3,8}\b/g);
        if (hex) offenders.push(`${file}: ${hex.join(', ')}`);
      }
    }
    expect(offenders, 'Use tokens or color-mix, not hex literals').toEqual([]);
  });

  it('2. no rgb() / rgba() in <style> blocks', async () => {
    const offenders: string[] = [];
    for (const { file, style } of await loadAll()) {
      for (const line of style.split('\n')) {
        if (shouldSkip(line)) continue;
        if (/rgba?\(/.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, 'Use oklch() or color-mix() instead of rgb/rgba').toEqual([]);
  });

  it('3. no hardcoded font-size px / rem in <style> blocks', async () => {
    const offenders: string[] = [];
    for (const { file, style } of await loadAll()) {
      for (const line of style.split('\n')) {
        if (shouldSkip(line)) continue;
        const m = line.match(/font-size:\s*(\d+px|\d*\.?\d+rem)/);
        if (m) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, 'Use var(--text-*) tokens').toEqual([]);
  });

  it('4. --warn / --danger forbidden in selected/active/is-current contexts', async () => {
    const offenders: string[] = [];
    for (const { file, style } of await loadAll()) {
      const rules = style.matchAll(/([^{}]+)\{([^{}]+)\}/g);
      for (const [, selector, body] of rules) {
        if (shouldSkip(body)) continue;
        // Only flags explicit state classes — :hover excluded because hover
        // patterns are governed by review (pattern #1 / #5), not by this rule.
        const isStateCtx = /\.(selected|active|is-current|chosen)\b/.test(selector);
        const usesAlertToken = /var\(--(warn|danger)(?![\w-])/.test(body);
        if (isStateCtx && usesAlertToken) {
          offenders.push(`${file}: ${selector.trim()}`);
        }
      }
    }
    expect(offenders,
      '--warn / --danger are alert semantics. Use color-mix(var(--accent), ...) for state classes.'
    ).toEqual([]);
  });

  it('5. tokens.css color set is exactly the approved 7', async () => {
    const css = await readFile('src/styles/tokens.css', 'utf8');
    const declared = Array.from(css.matchAll(/^\s*--([\w-]+):/gm), m => `--${m[1]}`);

    const TYPOGRAPHY = new Set([
      '--text-caption','--text-xs','--text-sm','--text-base','--text-lg',
      '--text-xl','--text-2xl','--text-3xl','--text-display',
      '--lh-caption','--lh-xs','--lh-sm','--lh-base','--lh-lg','--lh-xl',
      '--lh-2xl','--lh-3xl','--lh-display',
      '--font-sans','--font-mono','--font-normal','--font-medium','--font-bold',
    ]);
    const isStructural = (t: string) => /^--(space|radius|shadow)(-|$)/.test(t);
    const isTypography = (t: string) => TYPOGRAPHY.has(t);

    const APPROVED = new Set(['--bg','--surface','--text','--line','--accent','--warn','--danger']);

    const colorTokens = [...new Set(declared.filter(t => !isTypography(t) && !isStructural(t)))];
    const extras = colorTokens.filter(t => !APPROVED.has(t));
    const missing = [...APPROVED].filter(t => !colorTokens.includes(t));

    expect({ extras, missing }, 'Color token set is locked at 7. Modifying requires spec amendment + this test update.').toEqual({ extras: [], missing: [] });
  });

  it('6. no hex / rgba in inline style="..." attributes', async () => {
    const offenders: string[] = [];
    for (const { file, inline } of await loadAll()) {
      for (const line of inline.split(/[;\n]/)) {
        if (shouldSkip(line)) continue;
        if (/#[0-9a-fA-F]{3,8}\b/.test(line) || /rgba?\(/.test(line)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, 'Inline style attributes must reference tokens, not hex/rgba.').toEqual([]);
  });

  it('7. no numeric font-weight in <style> blocks', async () => {
    const offenders: string[] = [];
    for (const { file, style } of await loadAll()) {
      for (const line of style.split('\n')) {
        if (shouldSkip(line)) continue;
        const m = line.match(/font-weight:\s*(\d+)/);
        if (m) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, 'Use var(--font-normal|medium|bold)').toEqual([]);
  });
});
```

### Escape hatch: `design-system-allow:`

Any single CSS line preceded by a comment `/* design-system-allow: <reason> */` skips all rules. Use cases:

```css
.x-ray-viewer {
  /* design-system-allow: medical-imaging requires specific calibrated values */
  background: #1a1a1a;
}
```

Reviewer must approve the allow-list comment. The comment leaves audit trail.

### Pre-commit (optional convenience)

```sh
# .husky/pre-commit
pnpm vitest run tests/design-system.test.ts
```

Optional — CI is authoritative; pre-commit only improves local DX.

## Out of scope (explicit)

- **Spacing tokens** — `--space-1` through `--space-12` + `--space-3-5` remain as-is.
- **Shadow / radius tokens** — keep existing 4-step shadow + 6-step radius. `--radius-xs` (2px) defined in tokens.css but currently unused — retained for future inline-tag use.
- **Component structure** — `Button.svelte`, `Modal.svelte` etc. structure / behavior untouched; only their CSS color bindings change.
- **PDF (jsPDF)** — jsPDF uses literal hex, doesn't read CSS tokens. Color sync deferred to a separate spec.
- **Mermaid diagrams** — CLAUDE.md mandates hex for Mermaid; out of scope.

### Dark mode — explicit caveat

Dark mode is **not** "redefine the 7 tokens and everything follows". Known dark-mode work:

1. `--accent` L 0.48 too dark against dark bg. Needs L ≥ 0.72 for AA — a new value, not just a swap.
2. All color-mix percentages may need recalibration. `color-mix(--accent 4%, --bg)` on dark bg renders near-invisible; needs ~30% for equivalent visual weight.
3. `--text-muted` formula breaks: `color-mix(text, bg 30%)` on dark theme means mixing light text into dark bg → darker text on dark bg, the opposite of "muted".
4. Token-locked test (rule 5) must be updated to allow `[data-theme="dark"]` scoped redeclarations.

Expect 8-12 additional dark-mode-specific overrides + a parallel pattern library section. Plan as a separate spec when dark mode is prioritized.

## Affected files

| Action | Files | What |
|---|---|---|
| **Rewrite** | `src/styles/tokens.css` (1) | Collapse to 7 color tokens + hex + OKLCH; remove `--color-*` / `--bg-*` / `--state-*` / `--border-*` namespaces |
| **Rewrite** | `src/styles/global.css` (1) | `:focus-visible` to new pattern #12; `.prose a` to pattern #17; `.risk-*` utility classes to alert pattern #10 |
| **Sweep** | ~60-65 `.svelte` / `.astro` files | Mechanical token rename + 8 audit findings manually overridden to pattern bindings. Distribution: assess/* (~15), settings/* (~12), dashboard/*, workspace/*, patient/*, ui/*, alerts/*, education/*, fhir/*, pages/* |
| **Fix audit findings** | 8 sites (during sweep) | Apply pattern library bindings — see Migration notes |
| **Manual font-size sweep** | 2 known files | `Toast.svelte` line ~95 (`0.875rem` → `var(--text-xs)`), `SystemGuide.svelte:202` (`0.9em` — em is legal, leave as-is) |
| **New file** | `docs/superpowers/design-system.md` (1) | One-page summary linking back to this spec for in-repo discoverability |
| **New file** | `tests/design-system.test.ts` (1) | The seven Vitest rules above |

## Migration notes for the implementation plan

### Token renames (mechanical sweep, safe to scripted)

| Old | New |
|---|---|
| `var(--color-accent)` | `var(--accent)` |
| `var(--color-accent-hover)` | `color-mix(in srgb, var(--accent) 85%, black)` |
| `var(--color-accent-soft)` | `color-mix(in srgb, var(--accent) 10%, var(--bg))` |
| `var(--color-accent-light)` | `color-mix(in srgb, var(--accent) 12%, var(--bg))` — *⚠ see hue note below* |
| `var(--color-accent-strong)` | `color-mix(in srgb, var(--accent) 85%, black)` |
| `var(--color-text-base)` | `var(--text)` |
| `var(--color-text-muted)` | `color-mix(in srgb, var(--text), var(--bg) 30%)` |
| `var(--color-text-subtle)` | `color-mix(in srgb, var(--text), var(--bg) 50%)` — *enforce ≥ 24px or non-actionable use* |
| `var(--color-text-inverse)` | `var(--text-inverse)` (= `white`) |
| `var(--bg-base)` | `var(--bg)` |
| `var(--bg-surface)` | `var(--surface)` |
| `var(--bg-muted)` | context-dependent: **card / panel** → `var(--surface)`; **disabled / placeholder / progress track** → `color-mix(in srgb, var(--bg), var(--text) 5%)` |
| `var(--border-default)` | `var(--line)` (decorative only — `hr`, table inner divider) |
| `var(--border-strong)` | `color-mix(in srgb, var(--line), var(--text) 25%)` |
| `var(--color-risk-normal)` | `var(--accent)` |
| `var(--color-risk-normal-bg)` | `color-mix(in srgb, var(--accent) 12%, var(--bg))` (= accent-light visually; intentional, normal-status ≡ brand) |
| `var(--color-risk-advisory)` | `var(--warn)` |
| `var(--color-risk-advisory-bg)` | `color-mix(in srgb, var(--warn) 14%, var(--bg))` |
| `var(--color-risk-warning)` | `var(--warn)` |
| `var(--color-risk-warning-bg)` | `color-mix(in srgb, var(--warn) 14%, var(--bg))` |
| `var(--color-risk-critical)` | `var(--danger)` |
| `var(--color-risk-critical-bg)` | `color-mix(in srgb, var(--danger) 14%, var(--bg))` |
| `var(--state-selected-bg)` | `color-mix(in srgb, var(--accent) 10%, var(--bg))` |
| `var(--state-hover-surface)` | `color-mix(in srgb, var(--accent) 4%, var(--bg))` |
| `var(--state-focus-ring)` | `color-mix(in srgb, var(--accent) 45%, transparent)` |
| `var(--state-disabled-bg)` | `color-mix(in srgb, var(--bg), var(--text) 5%)` |
| `var(--state-disabled-text)` | `color-mix(in srgb, var(--text), var(--bg) 55%)` |

**⚠ accent-light hue shift**: The old `--color-accent-light` was `oklch(0.88 0.04 155)` — a slightly chromatic light green. The new `color-mix(--accent 12%, --bg)` mixes 12% accent into warm ivory, shifting hue toward neutral. Visually acceptable but **PR sweeps should side-by-side compare** the badge / chip pages (ContentViewer, LaunchSelector, EducationRecommend). If a specific case looks wrong, raise the mix to 18% or switch the interpolation to `color-mix(in oklch, ...)`.

### Dynamic CSS variables

Components occasionally use inline-style dynamic vars (e.g. `style="--bar-color: ..."` in `AlertCard.svelte`, `PatientList.svelte`). Rule: the value of any dynamic var **must** be `var(--token)` or `color-mix(var(--token), ...)`. Inline hex bypasses test 6 in the markup-detection sense but **test 6 catches it via inline-style scan**.

### 8 audit findings to manually override during sweep

These are not auto-mapped — each gets the correct pattern applied:

1. `QuestionnaireModule.svelte:330-331` — `.option-btn.selected` → Pattern #4
2. `NormsManager.svelte:251` — `tr.custom` → Pattern #4
3. `ModelManager.svelte:355-357` — `.model-card.current` → Pattern #4
4. `ModelManager.svelte:549-551` — `.version-item.is-current` → Pattern #4
5. `RecommendationsManager.svelte:481-483` — `.badge-override` → Pattern #6 normal
6. `AssessmentsTab.svelte:170-171` — `.mode-demo` badge → Pattern #6 normal
7. `LaunchSelector.svelte:159-160` — `.ehr-icon` → Pattern #6 normal
8. `ContentViewer.svelte:160-161` — `.format-badge--questionnaire` → Pattern #6 normal

### Sweep recommendation

Don't use raw `sed` for multi-line color-mix replacements — too fragile across editor differences. Use a node script with [`replace-in-file`](https://www.npmjs.com/package/replace-in-file) library, run as `pnpm migrate:tokens`. Single-line renames (token A → token B) are safe to sed.

## Verification

After implementation:

1. **Test suite**: `pnpm test` → all 7 design-system tests pass.
2. **Type check**: `pnpm check` shows no **new** errors / warnings vs `main` baseline. (Baseline expected to be 0 / 0 / 58 hints.)
3. **Hex sweep**: `grep -rE "#[0-9a-fA-F]{3,8}" src --include="*.svelte" --include="*.astro" --include="*.css"` returns only hits in `src/styles/tokens.css` fallback block and intentional JS palettes (`SERIES_COLORS` array in `AssessmentHistory.svelte`).
4. **RGB sweep**: `grep -rE "rgba?\(" src --include="*.svelte" --include="*.astro" --include="*.css"` empty.
5. **Visual regression** on key pages: home, `/assess/?` step 1, `/result/?id=`, `/workspace/`, `/settings/` system guide, `/education/` list, `/history/` compare mode.
6. **Contrast audit** with axe DevTools or browser picker on: `--text-muted` on `--surface`, `--warn` on `--warn-bg`, `--accent` on `--bg`, focus-ring visibility.
7. **PWA install** on iOS Safari + Android Chrome — theme-color and icon match new accent.

## Appendix: target `tokens.css` final content

```css
/* ==========================================================================
   Design Tokens — Smart Pedi CDSS
   7 source-of-truth color tokens. Derived values via color-mix() at site.
   See: docs/superpowers/specs/2026-05-16-design-system-spec.md
   ========================================================================== */

:root {
  /* Color (7) — hex fallback */
  --bg:       #fbf8f2;
  --surface:  #f5efe5;
  --text:     #33291d;
  --line:     #c8b896;
  --accent:   #3d6b54;
  --warn:     #945a10;
  --danger:   #b62b1f;

  /* Spacing (existing — out of scope of color rework) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-3-5: 14px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;  --space-7: 32px;
  --space-8: 40px; --space-9: 48px; --space-10: 64px; --space-11: 80px;
  --space-12: 96px;

  /* Radius (existing) */
  --radius-xs: 2px; --radius-sm: 4px; --radius-md: 8px;
  --radius-lg: 12px; --radius-xl: 16px; --radius-full: 9999px;

  /* Shadow (existing — warm shadows on text alpha) */
  --shadow-sm: 0 1px 2px rgba(51, 41, 29, 0.05), 0 1px 3px rgba(51, 41, 29, 0.08);
  --shadow-md: 0 2px 4px rgba(51, 41, 29, 0.06), 0 4px 8px rgba(51, 41, 29, 0.10);
  --shadow-lg: 0 4px 8px rgba(51, 41, 29, 0.08), 0 12px 24px rgba(51, 41, 29, 0.12);
  --shadow-xl: 0 8px 16px rgba(51, 41, 29, 0.10), 0 24px 48px rgba(51, 41, 29, 0.18);
}

@supports (color: oklch(0 0 0)) {
  :root {
    --bg:       oklch(0.985 0.006 85);
    --surface:  oklch(0.965 0.008 75);
    --text:     oklch(0.22  0.015 60);
    --line:     oklch(0.78  0.020 65);
    --accent:   oklch(0.48  0.08  155);
    --warn:     oklch(0.48  0.14  65);
    --danger:   oklch(0.48  0.20  25);

    /* Shadow OKLCH */
    --shadow-sm: 0 1px 2px oklch(0.22 0.015 60 / 0.05), 0 1px 3px oklch(0.22 0.015 60 / 0.08);
    --shadow-md: 0 2px 4px oklch(0.22 0.015 60 / 0.06), 0 4px 8px oklch(0.22 0.015 60 / 0.10);
    --shadow-lg: 0 4px 8px oklch(0.22 0.015 60 / 0.08), 0 12px 24px oklch(0.22 0.015 60 / 0.12);
    --shadow-xl: 0 8px 16px oklch(0.22 0.015 60 / 0.10), 0 24px 48px oklch(0.22 0.015 60 / 0.18);
  }
}

/* Native form-control accent — Pattern #18 */
:root { accent-color: var(--accent); }

@keyframes pulse-critical {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.6; }
}
```
