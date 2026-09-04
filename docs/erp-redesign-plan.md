# ERP (admin.html) — Redesign Plan

Focus: **layout** and **"อ่านออกใน 3 วินาที"** (a supervisor glancing for 3 seconds can tell:
1. is there anything I must act on now, 2. how is today vs normal, 3. which side — เข้า/ออก/สต๊อก — is busy).
Motion is used to **explain change**, never to decorate. Every number that moves, moved because the user did something.

---

## 1. What is weak in the current design

| # | Problem | Effect on the user |
|---|---------|--------------------|
| A | Dashboard has no focal point. 4 equal stat tiles; the ADMIN's #1 job (approve pending jobs) is one small tile + buried in the Details table's status column. | No "what do I do now". Approvals get missed. |
| B | Two overlapping tables — `งานล่าสุด` (10 latest) and `รายละเอียดทั้งหมด` (all filtered). 6 cols vs 9 cols, same data. | Unclear which table to look at. |
| C | Container↔vehicle conversion is a hidden algorithm: `3 ตู้ / 168 คัน` = `containers × 56`, never shown. | Users see totals that "don't add up". |
| D | Filter state (range + dept + search) is never restated in plain language. The "พนักงานในขอบเขตนี้" tile refers to a scope that is never spelled out. The day chart ignores the range chip (always 7 days). | User is unsure what they are looking at. |
| E | On mobile (`max-width:860px`) the sidebar collapses and `.navlist` is `display:none` — **the nav disappears entirely**. No hamburger, no bottom bar. | ERP is unusable on a phone. |
| F | Numbers snap instantly on filter change. | Hard to perceive that anything changed, or what. User re-reads the whole screen. |
| G | Bars and the day chart render at final width, no growth. | Proportion — the whole point of a bar — does not register. |
| H | Employees view is two bare number columns (`ช่วงที่เลือก`, `สะสม`), no visual. | Hard to compare people. |
| I | No real empty / loading / error design — only a text swap in the tiny sync line. | A failed load looks identical to "no data". |

Keep (already good): token-based CSS, dark mode, IBM Plex Sans Thai/Mono, the dept colour system
(INB amber / OUT green / INV purple), the card/panel shell, realtime sync.

---

## 2. Layout — new dashboard structure

Top-to-bottom, in priority order:

### (a) Action strip — the focal point
Full-width bar directly under the page head. **Only shown when `pendingCount > 0`.** Amber left border, elevated (shadow).
> ⚠️ มีงานรออนุมัติ **4 งาน** · เก่าสุดค้าง 2 วัน &nbsp;&nbsp; **[ ดูคิวอนุมัติ ]**

When zero: collapses to a thin green line — `✓ ไม่มีงานค้างอนุมัติ`. Elevation on the page means exactly one thing: *act on me.*

### (b) Scope sentence
One plain-Thai line under the filter bar, generated from filter state, updates live:
> กำลังดู · **ทุกฝั่ง** · **วันนี้ (4 ก.ย.)** · 12 งาน

The filter's effect is always legible without the user reconstructing it from three chip groups.

### (c) Three "side" cards (INB / OUT / INV) in a row
Replaces the current `งานที่เสร็จแยกตามฝั่ง` bar list **and** `ผลผลิตตามหน่วย` cards (currently a split panel). Each card:
- coloured header (existing dept colour)
- **big number**: งานที่เสร็จ in this scope
- secondary: ผลผลิตตามหน่วย with the conversion made explicit (see §4)
- a 7-bar daily sparkline — trend lives *in* the card, not in a separate panel
- OUT card shows a red `มีปัญหา N คัน` chip when `> 0`

### (d) One activity table
Merge `งานล่าสุด` + `รายละเอียดทั้งหมด` into a single table. Newest first, respects filters, paginated.
Inline approve/reject for ADMIN on pending rows. The old "รายละเอียดทั้งหมด" nav item becomes a
preset row above the table: `ทั้งหมด | รออนุมัติ | วันนี้`.

### (e) Approval queue — new dedicated view
Card list (not a table) of pending jobs, sorted by the ranking algorithm (§5). Large
`[ อนุมัติ ]` / `[ ไม่อนุมัติ ]` per card. Optional `อนุมัติทั้งฝั่งนี้` batch action (decision — see §11).

---

## 3. Layout — navigation & shell

| Viewport | Nav |
|---|---|
| ≥ 960px | Sidebar as today. |
| 640–960px | Sidebar collapses to a 64px **icon rail**; label on hover/active. |
| < 640px | **Fixed bottom tab bar** (56px + safe-area), 4 items: `ภาพรวม / คิวอนุมัติ / งานทั้งหมด / คน`. Replaces the broken collapsed sidebar. |

- `ผู้ใช้งานระบบ` (rarely used, admin-only) moves out of the main nav to a **gear icon** in the header.
- Mobile filter bar: range chips stay; dept becomes a segmented control; search collapses to an icon that expands on tap.
- Touch targets ≥ 44×44px throughout.

---

## 4. Small algorithm — make the container↔vehicle conversion visible

A `describeUnit(task, details)` helper turns raw fields into something a human reads correctly the first time:

| Situation | Shown | Caption |
|---|---|---|
| INB unload, vehicles **derived** (`containers × vehiclesPerContainer`) | `3 ตู้ ≈ 168 คัน` | `(56 คัน/ตู้)` — small, grey |
| INB unload, vehicles **actually entered** (`details.vehicles`) | `3 ตู้ · 171 คัน` | none |

- `≈` + caption = "this is an estimate from a multiplier".
- `·` + no caption = "both numbers were counted".
- Unit cards stack the two units **vertically** with the relationship symbol between them — never side-by-side as two unrelated figures.

This is the kind of "small algorithm" the brief asks for: a deterministic rule that removes a
recurring misread.

---

## 5. Small algorithm — approval queue ranking

`urgencyScore(job)` = weighted sum:
- **age** in hours since `created_at` — main term
- **+ batch penalty** if the same crew has other pending jobs (keeps a crew's jobs adjacent so they're reviewed together)
- **+ problem boost** for OUT jobs flagged `hasIssue` — problems shouldn't wait behind routine work
- jobs from the same day/crew cluster next to each other

Sort descending. Each card shows the **top reason** as a chip so the order is never mysterious:
`ค้าง 2 วัน` · `มีปัญหา` · `รออีก 3 งานของทีมนี้`.

---

## 6. Physics — animated number counters

When a stat value changes (filter change or realtime update), tween old → new with a **damped spring**
(not CSS, not linear):

```
F = (target - current) * STIFFNESS  -  velocity * DAMPING
STIFFNESS ≈ 120,  DAMPING ≈ 18      // snappier than 3D-rotation defaults, ~no overshoot
```

- fixed `1/60` timestep with a time accumulator (correct even if frames drop)
- `Math.round` the displayed value each frame; `font-variant-numeric: tabular-nums` (already set) stops digit-width jitter
- natural duration ~400–600ms
- **direction cue**: ticking up → tile border flashes green briefly (`easeOutCubic`, CSS — safe, different property); down → neutral grey
- `prefers-reduced-motion` → snap instantly, no tween

**Why:** the #1 confusion on a filtered dashboard is *"did my click do anything / what changed?"*
A ~500ms weighted count-up answers both without a word. An overshoot/bounce would read as broken, so damping is high.

---

## 7. Physics — bar & sparkline growth

- Bars grow `0 → target` with a spring (`STIFFNESS ≈ 90`, `DAMPING ≈ 16`, tiny settle), **staggered ~40ms per bar** so the eye follows left-to-right and reads the shape.
- Sparkline draws as a `stroke-dashoffset` reveal (`easeInOutCubic`, CSS — safe).
- `prefers-reduced-motion` → final state immediately.

**Why:** proportion is the message of a bar chart; a bar that was always at its final width gives the eye nothing to latch onto.

---

## 8. Physics — layout transitions on reorder (FLIP)

When a job is approved/rejected and leaves the queue, or the activity table re-sorts:

- **FLIP**: measure old rect → apply new layout → invert with `transform` → play to 0 with `easeOutCubic`.
  JS computes the delta once; **CSS plays it** (transform/opacity only) — no per-frame fight, no stutter (the "CSS Transition Trap": never let CSS transition a property JS is driving frame-by-frame).
- Removed row: fade + collapse height ~250ms before the list settles.
- New pending job via realtime: slides in from top, single amber pulse.

**Why:** things appearing/vanishing instantly force a full re-scan; a 250ms move lets the user keep their place.

---

## 9. Micro-interactions

- Chips / nav / buttons: `scale(0.97)` on tap, `scale(1.03)` on hover, `easeOutCubic`.
- Approve success: brief `easeOutElastic` checkmark swap — tactile confirmation.
- Mobile: pull-to-refresh with a spring-damped spinner.

---

## 10. Comprehension details (non-motion)

- **Empty states** — per view: icon + one sentence + (if filtered) `ล้างตัวกรอง` button. Visually distinct from the error state.
- **Error state** — red-bordered card `โหลดข้อมูลไม่สำเร็จ` + `[ ลองใหม่ ]`, replaces content. Never a silent empty table.
- **Loading** — skeleton shimmer on cards/rows for the *first* load only; realtime refreshes stay invisible (or a 1px sync tick).
- **Relative dates** — `formatWhen()`: `วันนี้ 14:32` / `เมื่อวาน` / `3 ก.ย.` instead of raw ISO.
- **Number magnitude** — counts ≥ 10,000 → `1.2 หมื่น`, exact value on `title` hover. Keeps tiles from overflowing, easier to size-compare.
- **Status column** — keep the badge; sort pending rows to the top of the table always; dot-only badge variant at narrow widths.
- Dept colour legend appears **once** (near the scope sentence), not repeated per component.

---

## 11. Visual system tweaks (within current tokens)

- **Type scale**: h1 22→20, panel h2 15→14; widen the gap between label (12) and big number (28→32). Bigger numbers make the page read as an instrument panel.
- **Elevation = "act on me"**: shadow only on the action strip and elevated cards; flat everywhere else.
- **Colour discipline**: dept colours = identity; accent blue = interactive/selected; red = needs attention/problem; green = ok/done. Nothing else.
- **Spacing**: snap everything to an 8px grid (currently mixes 6/8/12/14/16/18/20/22/26/30).

---

## 12. Implementation phases (each independently shippable, cache-bust bumped)

1. **Shell + nav** — bottom tab bar (mobile), icon rail (tablet), move `users` view to a gear icon. CSS + small JS, no data changes.
2. **Dashboard restructure** — action strip, scope sentence, 3 side cards, merge the two tables. `admin.js` render functions + `admin.css`.
3. **Approval queue view** — new view + `urgencyScore` ranking.
4. **Physics layer** — one new `js/anim.js` (~120 lines): `spring()`, `tweenCount()`, `growBars()`, `flip()`. `prefers-reduced-motion` guard at the top. Wire into existing render calls. (New `<script src>` — fine under CSP `script-src 'self'`.)
5. **States** — empty / error / loading / skeleton components.
6. **Polish** — micro-interactions, type scale, 8px spacing grid.

---

## 13. Decisions — ANSWERED (2026-09-04)

1. **Scope** → **incremental** per the phases in §12. One reviewable diff per phase.
2. **ERP on phones** → **yes, used on mobile.** The bottom tab bar (phase 1) stays in scope and keeps priority.
3. **Batch approve** → **yes.** Ship `อนุมัติทั้งฝั่งนี้` in the approval queue (§2e). Confirm dialog listing the count before it runs.
4. **Motion layer scope** → **ERP-only (`admin.html`) for now.** Revisit `index.html` (worker app) after the ERP work lands.

---

## Notes on skills used

- **`icg-360-parts-explorer` → `references/physics-animation.md`** — source for the damped-spring formula, fixed-timestep integration, the CSS-Transition-Trap split (JS owns frame-by-frame transforms, CSS owns everything else), and easing-per-interaction table. Applied throughout §6–§9.
- **`icg-360-parts-explorer` → `references/ux-search-patterns.md`** — search prominence, "search everything" default, ≥44px touch targets, mobile bottom-sheet over sidebar, zero-dead-end faceting. Applied in §3, §10.
- **`canvas-design`** — reviewed; it produces abstract art posters (.png/.pdf), not product UI, so its process was not applied. Its one transferable idea (a named design principle stated up front, then held consistently) is reflected in the "อ่านออกใน 3 วินาที" framing.
- **Figma MCP** — requires OAuth; unavailable in this session. If you have Figma files for this, authorise the connector and I can pull frames/tokens directly.
