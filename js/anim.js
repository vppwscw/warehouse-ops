// ===================== anim.js — small physics layer for the ERP =====================
// Motion here exists to *explain change*, never to decorate: a number that moves
// moved because the user did something. Three primitives + FLIP, all no-ops under
// prefers-reduced-motion.
//
// CSS-Transition-Trap rule: JS owns only the properties it drives frame-by-frame
// (a counter's text, a bar's height mid-spring). FLIP hands the final playback to
// the Web Animations API / CSS — JS computes the delta once, it does not fight.

window.Anim = (function () {
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STEP = 1 / 60;               // fixed timestep — consistent regardless of refresh rate
  const fmt = n => String(n);

  // Damped harmonic oscillator, integrated with a time accumulator so physics
  // stays correct even when the browser drops frames.
  function springTo({ from, to, stiffness, damping, epsilon, onframe, ondone }) {
    epsilon = epsilon || 0.5;
    if (REDUCED) { onframe(to); if (ondone) ondone(); return function () {}; }
    let x = from, v = 0, acc = 0, last = performance.now(), start = last, raf = 0;
    function tick(now) {
      acc += Math.min(0.064, (now - last) / 1000);   // clamp — no spiral of death
      last = now;
      if (now - start > 1600) {                       // hard cap — always terminates
        onframe(to); if (ondone) ondone(); return;
      }
      while (acc >= STEP) {
        const a = (to - x) * stiffness - v * damping;
        v += a * STEP;
        x += v * STEP;
        acc -= STEP;
      }
      if (Math.abs(to - x) < epsilon && Math.abs(v) < epsilon) {
        onframe(to); if (ondone) ondone(); return;
      }
      onframe(x);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return function () { cancelAnimationFrame(raf); };
  }

  // Number counter. `el` holds only the number text (unit lives in a sibling).
  // Snappy + almost no overshoot — a count that bounces past reads as broken.
  function count(el, to, from) {
    to = Math.round(Number(to) || 0);
    from = Math.round(Number(from));
    if (!isFinite(from)) from = to;
    if (REDUCED || from === to) { el.textContent = fmt(to); return; }
    if (to > from) flash(el.closest('.side-card'));
    springTo({
      from: from, to: to, stiffness: 120, damping: 18, epsilon: 0.5,
      onframe: v => { el.textContent = fmt(Math.round(v)); },
      ondone: () => { el.textContent = fmt(to); }
    });
  }

  // Bars grow 0 -> target with a gentle settle, staggered left-to-right so the
  // eye reads the shape. Skips when the data is unchanged (avoids re-growing on
  // every realtime tick). `container` children matched by `sel` must carry an
  // inline height in px.
  function bars(container, sel, opts) {
    opts = opts || {};
    const els = Array.prototype.slice.call(container.querySelectorAll(sel));
    if (!els.length) return;
    const targets = els.map(e => parseFloat(e.style.height) || 0);
    const sig = targets.map(Math.round).join(',');
    if (container.dataset.animSig === sig) return;    // unchanged — leave at rest
    container.dataset.animSig = sig;
    if (REDUCED) return;
    const stiffness = opts.stiffness || 90;
    const damping = opts.damping || 16;
    const stagger = opts.stagger == null ? 40 : opts.stagger;
    els.forEach((el, i) => {
      const target = targets[i];
      el.style.height = '0px';
      setTimeout(function () {
        springTo({
          from: 0, to: target, stiffness: stiffness, damping: damping, epsilon: 0.3,
          onframe: v => { el.style.height = v + 'px'; },
          ondone: () => { el.style.height = target + 'px'; }
        });
      }, i * stagger);
    });
  }

  // FLIP: measure -> mutate the DOM -> invert with a transform -> let the Web
  // Animations API play it to rest. Items are matched across the mutation by
  // `data-flip-id`; unknown ids after the mutation fade in.
  function flipList(container, itemSel, mutate) {
    if (REDUCED || !container.children.length) { mutate(); return; }
    const before = new Map();
    container.querySelectorAll(itemSel).forEach(el => {
      if (el.dataset.flipId) before.set(el.dataset.flipId, el.getBoundingClientRect());
    });
    mutate();
    container.querySelectorAll(itemSel).forEach(el => {
      const id = el.dataset.flipId;
      const prev = id && before.get(id);
      if (!prev) {
        el.animate(
          [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 200, easing: 'cubic-bezier(.2,.7,.3,1)' }
        );
        return;
      }
      const now = el.getBoundingClientRect();
      const dx = prev.left - now.left, dy = prev.top - now.top;
      if (!dx && !dy) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' }
      );
    });
  }

  function flash(el) {
    if (REDUCED || !el) return;
    el.classList.remove('anim-up');
    void el.offsetWidth;               // restart the animation
    el.classList.add('anim-up');
    setTimeout(() => el.classList.remove('anim-up'), 800);
  }

  return { count: count, bars: bars, flipList: flipList, reduced: REDUCED };
})();
