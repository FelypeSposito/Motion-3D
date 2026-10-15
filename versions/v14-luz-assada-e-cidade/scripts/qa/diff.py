"""Compara capturas "antes" x "depois" do QA visual.

Uso:
  py -I scripts/qa/diff.py                              # docs/qa/before x docs/qa/after
  py -I scripts/qa/diff.py <pasta_a> <pasta_b> [saida]  # ex.: before/d1440-* x before/d1440-nobake-* (ver --pair)
  py -I scripts/qa/diff.py --pair d1440 d1440-nobake    # dentro de docs/qa/before: compara prefixos

Para cada PNG com o mesmo nome nas duas pastas: PSNR (dB), SSIM aproximado (janela 8x8, luminância),
diferença média absoluta (0..255) e % de pixels com diferença > 8. Grava imagens de diferença (|a-b| x4)
lado a lado (a | b | diff) em docs/qa/diff/ e um resumo em docs/qa/diff/report.txt.
Leitura: PSNR >= 40 dB ~ idêntico a olho; 30–40 pequenas mudanças; < 25 mudança forte. SSIM 1 = igual.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "docs" / "qa"


def load(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)


def psnr(a, b):
    mse = np.mean((a - b) ** 2)
    return float("inf") if mse == 0 else 10 * np.log10(255.0 ** 2 / mse)


def ssim_approx(a, b, w=8):
    # SSIM sobre luminância, em blocos w x w sem sobreposição (aproximação rápida, sem scipy)
    la = a @ [0.299, 0.587, 0.114]; lb = b @ [0.299, 0.587, 0.114]
    h, ww = (la.shape[0] // w) * w, (la.shape[1] // w) * w
    A = la[:h, :ww].reshape(h // w, w, ww // w, w).swapaxes(1, 2).reshape(-1, w * w)
    B = lb[:h, :ww].reshape(h // w, w, ww // w, w).swapaxes(1, 2).reshape(-1, w * w)
    ma, mb = A.mean(1), B.mean(1)
    va, vb = A.var(1), B.var(1)
    cov = ((A - ma[:, None]) * (B - mb[:, None])).mean(1)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    s = ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma ** 2 + mb ** 2 + c1) * (va + vb + c2))
    return float(s.mean())


def compare(pairs, out):
    out.mkdir(parents=True, exist_ok=True)
    lines = [f"{'imagem':40s} {'PSNR':>7s} {'SSIM':>6s} {'MAE':>6s} {'%>8':>6s}"]
    for name, pa, pb in pairs:
        a, b = load(pa), load(pb)
        if a.shape != b.shape:   # tamanhos diferentes: redimensiona b para a (avisa)
            b = np.asarray(Image.open(pb).convert("RGB").resize((a.shape[1], a.shape[0]), Image.LANCZOS), dtype=np.float64)
            name += " (redim.)"
        d = np.abs(a - b)
        p, s = psnr(a, b), ssim_approx(a, b)
        mae, frac = d.mean(), (d.max(2) > 8).mean() * 100
        lines.append(f"{name:40s} {p:7.2f} {s:6.4f} {mae:6.2f} {frac:6.2f}")
        vis = np.clip(d * 4, 0, 255).astype(np.uint8)
        sheet = np.concatenate([a.astype(np.uint8), b.astype(np.uint8), vis], axis=1)
        im = Image.fromarray(sheet)
        if im.width > 2400:
            im = im.resize((2400, round(im.height * 2400 / im.width)), Image.LANCZOS)
        im.save(out / f"{Path(name.split(' ')[0]).stem}.jpg", quality=88)
    report = "\n".join(lines)
    (out / "report.txt").write_text(report + "\n", encoding="utf-8")
    print(report)
    print("\nimagens de diferença em", out)


def main(argv):
    if argv[:1] == ["--pair"]:
        pa, pb = argv[1], argv[2]
        base = Path(argv[3]) if len(argv) > 3 else QA / "before"
        pairs = []
        for f in sorted(base.glob(f"{pa}-p*.png")):
            g = base / f.name.replace(pa + "-", pb + "-", 1)
            if g.exists():
                pairs.append((f.name, f, g))
        compare(pairs, QA / "diff" / f"{pa}_vs_{pb}")
        return
    A = Path(argv[0]) if argv else QA / "before"
    B = Path(argv[1]) if len(argv) > 1 else QA / "after"
    out = Path(argv[2]) if len(argv) > 2 else QA / "diff"
    pairs = [(f.name, f, B / f.name) for f in sorted(A.glob("*.png")) if (B / f.name).exists()]
    missing = [f.name for f in sorted(A.glob("*.png")) if not (B / f.name).exists()]
    if missing:
        print("sem par em", B, ":", ", ".join(missing))
    if not pairs:
        sys.exit("nenhum par encontrado")
    compare(pairs, out)


if __name__ == "__main__":
    main(sys.argv[1:])
