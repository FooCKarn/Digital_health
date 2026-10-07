import tokens from "./tokens.css?raw";
import base from "./base.css?raw";

// อ่านค่าสีจริงจาก tokens.css (บล็อกสว่าง = :root แรก, บล็อกมืด = ใน @media dark)
const darkStart = tokens.indexOf("prefers-color-scheme: dark");
const blocks = { light: tokens.slice(0, darkStart), dark: tokens.slice(darkStart) };

function vars(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/(--c-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2];
  return out;
}
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

// คู่ fg/bg ที่ใช้จริงในป้าย ปุ่ม และข้อความหลัก
const PAIRS: [string, string][] = [
  ["--c-avoid-fg", "--c-avoid-bg"], ["--c-caution-fg", "--c-caution-bg"],
  ["--c-info-fg", "--c-info-bg"], ["--c-noflag-fg", "--c-noflag-bg"],
  ["--c-nodata-fg", "--c-surface"], ["--c-text", "--c-bg"], ["--c-text", "--c-surface"],
  ["--c-muted", "--c-bg"], ["--c-muted", "--c-surface"],
  ["--c-primary", "--c-bg"], ["--c-primary", "--c-surface"], ["--c-on-primary", "--c-primary"],
];

describe("contrast (WCAG) จาก tokens.css", () => {
  for (const theme of ["light", "dark"] as const) {
    const v = vars(blocks[theme]);
    it.each(PAIRS)(`${theme}: %s บน %s >= 4.5`, (fg, bg) => {
      expect(v[fg], `${fg} ต้องมีใน ${theme}`).toBeDefined();
      expect(v[bg], `${bg} ต้องมีใน ${theme}`).toBeDefined();
      expect(ratio(v[fg], v[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("primary แสงสว่างคือ #0E7490", () => {
    expect(vars(blocks.light)["--c-primary"].toLowerCase()).toBe("#0e7490");
  });
  it("โทเคน no_flag ไม่ใช่สีเขียว (ทั้งสองธีม)", () => {
    for (const theme of ["light", "dark"] as const) {
      const v = vars(blocks[theme]);
      for (const k of ["--c-noflag-fg", "--c-noflag-bg"]) {
        const h = hue(v[k]);
        expect(h < 75 || h > 165, `${theme} ${k} hue ${h}`).toBe(true);
      }
    }
  });
});

describe("base.css", () => {
  it("ปุ่มกำหนด min-height 44px", () => {
    expect(base).toMatch(/button[^{]*\{[^}]*min-height:\s*44px/);
  });
  it("มี focus-visible, reduced-motion, 16px/1.6", () => {
    expect(base).toMatch(/:focus-visible/);
    expect(base).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(base).toMatch(/font-size:\s*16px/);
    expect(base).toMatch(/line-height:\s*1\.6/);
  });
});
