// SEO/โครงหน้าของ web/index.html เทียบกับหน้าเดิม public/index.html (สถานการณ์เดิม 0 + หมายเหตุ go-live ใน hackathon.md)
import { readFileSync } from "node:fs";
import html from "../index.html?raw";

const parse = (s: string) => new DOMParser().parseFromString(s, "text/html");
const web = parse(html);
const legacy = parse(readFileSync("../public/index.html", "utf8"));
const meta = (d: Document, sel: string) => d.querySelector<HTMLMetaElement>(`meta[${sel}]`)?.content;

test("lang=th, title, meta description ยาวพอ และ robots noindex, nofollow (ค่าเดียวกับหน้าเดิม)", () => {
  expect(web.documentElement.lang).toBe("th");
  expect(web.title).toContain("HerbGuard TTM");
  expect(web.title).toBe(legacy.title);
  expect(meta(web, "name=description")!.length).toBeGreaterThan(60);
  expect(meta(web, "name=robots")).toBe("noindex, nofollow");
  expect(meta(web, "name=robots")).toBe(meta(legacy, "name=robots"));
});

test("meta description/theme-color/og/twitter ยกมาจากหน้าเดิมครบและค่าตรงกัน", () => {
  const sels = [...legacy.querySelectorAll("meta[name], meta[property]")]
    .map((m) => (m.hasAttribute("name") ? `name="${m.getAttribute("name")}"` : `property="${m.getAttribute("property")}"`))
    .filter((s) => !s.includes("viewport"));
  expect(sels).toEqual(expect.arrayContaining(['property="og:title"', 'property="og:description"', 'name="twitter:card"']));
  for (const s of sels) expect([s, meta(web, s)]).toEqual([s, meta(legacy, s)]);
});

test("JSON-LD อ่านได้ เป็น WebApplication และตรงกับหน้าเดิม", () => {
  const ld = (d: Document) => JSON.parse(d.querySelector('script[type="application/ld+json"]')!.textContent!);
  expect(ld(web)["@type"]).toBe("WebApplication");
  expect(ld(web)).toEqual(ld(legacy));
});

test("noscript มีข้อความเดิม รวมคำว่า ไม่ใช่การวินิจฉัย และไม่มีคำว่า ปลอดภัย", () => {
  const text = (d: Document) => d.querySelector("noscript")!.textContent!.replace(/<[^>]+>/g, "").trim();
  expect(text(web)).toBe(text(legacy));
  expect(text(web)).toContain("ไม่ใช่การวินิจฉัย");
  expect(text(web)).not.toContain("ปลอดภัย");
});

test("ยังไม่เปิดให้ค้นหา: ไม่มี canonical, og:url, sitemap", () => {
  expect(web.querySelector('link[rel="canonical"]')).toBeNull();
  expect(web.querySelector('meta[property="og:url"]')).toBeNull();
  expect(html.replace(/<!--[\s\S]*?-->/g, "")).not.toMatch(/sitemap/i); // คอมเมนต์ ponytail อธิบายวิธีเปิดดัชนีได้
});
