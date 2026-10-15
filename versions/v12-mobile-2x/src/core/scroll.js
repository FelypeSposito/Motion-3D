// Rolagem virtual da narrativa: roda do mouse, toque e teclado viram um progresso contínuo
// de 0 até o número de capítulos. A página não rola de verdade (nada de reflow/repaint).
export function createScroll({ max, onChange }) {
  let target = 0, value = 0, touchY = null, enabled = false;
  const clamp = (v) => Math.min(Math.max(v, 0), max);
  const push = (d) => { if (enabled) target = clamp(target + d); };

  addEventListener("wheel", (e) => push(e.deltaY * 0.00055), { passive: true });   // ~40% mais lento que antes
  addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (touchY === null) return;
    const y = e.touches[0].clientY; push((touchY - y) * 0.0015); touchY = y;
  }, { passive: true });
  addEventListener("touchend", () => { touchY = null; });
  addEventListener("keydown", (e) => {
    if (["ArrowDown", "PageDown", " "].includes(e.key)) push(0.15);
    if (["ArrowUp", "PageUp"].includes(e.key)) push(-0.15);
  });

  return {
    enable() { enabled = true; },
    goTo(v) { target = clamp(v); },
    // suavização exponencial independente da taxa de quadros
    update(dt) {
      const prev = value;
      value += (target - value) * (1 - Math.exp(-dt * 4.5));
      if (Math.abs(value - prev) > 1e-5) onChange(value);
      return value;
    },
    get value() { return value; },
  };
}
