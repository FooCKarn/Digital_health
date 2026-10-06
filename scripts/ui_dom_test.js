// ทดสอบหน้าเว็บ public/index.html ด้วย jsdom กับเซิร์ฟเวอร์ในเครื่อง (ไม่ต้องมีเบราว์เซอร์ ไม่ใช้ API key)
// ติดตั้ง jsdom นอก repo (ไม่เพิ่ม dependency ให้ Vercel): mkdir $TEMP/domtest; cd $TEMP/domtest; npm i jsdom
// รัน: python scripts/dev_server.py 8765  แล้ว  NODE_PATH=<โฟลเดอร์ domtest>/node_modules node scripts/ui_dom_test.js http://127.0.0.1:8765
// หมายเหตุ: jsdom ไม่ใช่เบราว์เซอร์/โปรแกรมอ่านหน้าจอจริง ตรวจโครงสร้าง โฟกัส และข้อความประกาศใน DOM เท่านั้น
const { JSDOM } = require("jsdom");
const BASE = process.argv[2];
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  OK   " : "  FAIL ") + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }

async function load() {
  const dom = await JSDOM.fromURL(BASE + "/", {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    beforeParse(w) {
      w.__calls = 0;
      // fetch ที่ควบคุมได้: หน่วงเวลา/จำลองเครือข่ายล่ม เฉพาะ /api/analyze
      w.fetch = async (u, o) => {
        if (String(u).includes("/api/analyze")) { w.__calls++; if (w.__delay) await sleep(w.__delay); if (w.__fail) throw new Error("network down"); }
        return fetch(new URL(u, BASE), o);
      };
      w.Element.prototype.scrollIntoView = () => {}; w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
    },
  });
  const w = dom.window, d = w.document;
  await waitFor(() => d.querySelectorAll("#herbAdd option").length > 1);
  return { w, d, $: (id) => d.getElementById(id) };
}
// ผู้ใช้เมาส์/นิ้วเลือกจาก dropdown: mousedown แล้วค่าเปลี่ยน -> เพิ่มทันที (แตะครั้งเดียว)
function pick(w, d, selId, textPart) {
  const s = d.getElementById(selId), o = [...s.options].find((x) => x.textContent.includes(textPart) && !x.disabled);
  if (!o) throw new Error(`ไม่พบตัวเลือก '${textPart}' ใน ${selId}`);
  s.dispatchEvent(new w.Event("mousedown", { bubbles: true }));
  s.value = o.value; s.dispatchEvent(new w.Event("input", { bubbles: true })); s.dispatchEvent(new w.Event("change", { bubbles: true }));
}
// ผู้ใช้คีย์บอร์ด: กดลูกศร (keydown) แล้วค่าเปลี่ยน -> ยังไม่เพิ่ม
function arrowTo(w, d, selId, textPart) {
  const s = d.getElementById(selId), o = [...s.options].find((x) => x.textContent.includes(textPart) && !x.disabled);
  s.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  s.value = o.value; s.dispatchEvent(new w.Event("input", { bubbles: true })); s.dispatchEvent(new w.Event("change", { bubbles: true }));
  return s;
}
const busy = (d) => d.getElementById("go").getAttribute("aria-disabled") === "true";
async function submit(d) { d.getElementById("go").click(); return waitFor(() => !busy(d) && (!d.getElementById("out").hidden)); }
const live = async (d) => { await sleep(150); return d.getElementById("live").textContent; };

function accName(e, d) {
  const al = e.getAttribute("aria-label"); if (al && al.trim()) return al.trim();
  const lb = e.getAttribute("aria-labelledby");
  if (lb) { const t = lb.split(/\s+/).map((i) => (d.getElementById(i) || {}).textContent || "").join(" ").trim(); if (t) return t; }
  if (e.id) { const l = d.querySelector(`label[for="${e.id}"]`); if (l && l.textContent.trim()) return l.textContent.trim(); }
  const wl = e.closest("label"); if (wl && wl.textContent.trim()) return wl.textContent.trim();
  if (e.tagName === "BUTTON" && e.textContent.trim()) return e.textContent.trim();
  return "";
}

(async () => {
  console.log("== 0) SEO / โครงสร้างหน้า ==");
  let { w, d, $ } = await load();
  ok(d.title.includes("HerbGuard TTM") && d.documentElement.lang === "th", `title: "${d.title}"`);
  ok(d.querySelector('meta[name=description]').content.length > 60 && d.querySelector('meta[name=robots]').content === "noindex, nofollow", "description + robots noindex");
  ok(d.querySelectorAll("h1").length === 1 && !!d.querySelector("header") && !!d.querySelector("main") && !!d.querySelector("footer"), "h1 เดียว + header/main/footer");
  let ld = null; try { ld = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent); } catch (e) {}
  ok(ld && ld["@type"] === "WebApplication", "JSON-LD อ่านได้");
  ok(d.body.textContent.replace(/ไม่ได้(แปลว่า|หมายความว่า)ปลอดภัย/g, "").indexOf("ปลอดภัย") === -1, "ไม่มีคำว่า ปลอดภัย นอกเชิงปฏิเสธ");

  console.log("== 1) dropdown: เมาส์/นิ้ว เพิ่มทันที · คีย์บอร์ดเลื่อนดูได้โดยไม่เพิ่ม ==");
  ok(d.querySelectorAll("#herbAdd option").length - 1 >= 21 && d.querySelectorAll("#drugAdd option").length - 1 >= 5 && d.querySelectorAll("#condAdd option").length - 1 >= 20, "dropdown ครบ");
  ok(d.querySelectorAll("input[type=checkbox]").length === 0, "ไม่มีช่องติ๊กรกหน้า");
  const hs = $("herbAdd"), khing = [...hs.options].find((o) => o.textContent === "ขิง");
  arrowTo(w, d, "herbAdd", "ขิง");  // กดลูกศรบน dropdown ที่ปิดอยู่ (เบราว์เซอร์ยิง change ทุกครั้ง)
  ok(d.querySelectorAll("#herbSel .sel").length === 0 && hs.value === khing.value, "คีย์บอร์ด: กดลูกศรเลื่อนดู ยังไม่เพิ่มสมุนไพร");
  hs.dispatchEvent(new w.Event("blur"));
  ok(hs.value === "" && d.querySelectorAll("#herbSel .sel").length === 0, "คีย์บอร์ด: เลื่อนดูแล้วออกจากช่องโดยไม่ยืนยัน -> ยกเลิก ไม่ค้างค่าที่ยังไม่ได้เพิ่ม");
  arrowTo(w, d, "herbAdd", "ขิง"); hs.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  ok(d.querySelectorAll("#herbSel .sel").length === 1 && hs.value === "", "คีย์บอร์ด: กด Enter -> เพิ่ม");
  d.querySelector("#herbSel .sel button").click();
  arrowTo(w, d, "herbAdd", "ขิง"); $("herbAddBtn").click();
  ok(d.querySelectorAll("#herbSel .sel").length === 1, "คีย์บอร์ด: กดปุ่ม เพิ่ม -> เพิ่ม");
  d.querySelector("#herbSel .sel button").click();
  hs.value = ""; $("herbAddBtn").click();
  ok((await live(d)).includes("เลือกรายการจากช่องก่อน") && d.activeElement === hs, "กดเพิ่มโดยไม่เลือก -> ประกาศให้เลือกก่อน + โฟกัสอยู่ที่ dropdown");
  ok(!!$("addHint") && ["herbAdd", "drugAdd", "condAdd"].every((id) => ($(id).getAttribute("aria-describedby") || "").includes("addHint")), "มีคำอธิบายวิธีใช้คีย์บอร์ดผูกกับ dropdown ทั้ง 3");
  pick(w, d, "herbAdd", "ขิง");  // เมาส์/นิ้ว: เลือกครั้งเดียวเพิ่มทันที (ไม่ต้องกดปุ่ม)
  const row = d.querySelector("#herbSel .sel");
  ok(!!row && row.querySelector(".part") && row.querySelector(".days") && row.querySelector("button"), "เมาส์/นิ้ว: เลือกครั้งเดียวขึ้นแถวทันที: ชื่อ + ส่วนที่ใช้ + วัน + ลบ");
  ok((await live(d)).includes("เพิ่ม ขิง แล้ว เลือกแล้ว 1 ชนิด"), "ประกาศการเพิ่ม (พื้นที่ประกาศ)");
  ok(khing.disabled && d.activeElement === hs, "ตัวเลือกที่เลือกแล้วถูกปิด และโฟกัสอยู่ที่ dropdown เพื่อเพิ่มต่อ");
  row.querySelector("button").click();
  ok(!khing.disabled && d.activeElement === hs && (await live(d)).includes("ลบ ขิง แล้ว"), "ลบแล้วตัวเลือกกลับมา + ประกาศ + โฟกัสกลับ dropdown");

  console.log("== 2) กด ตรวจ โดยไม่เลือกอะไร ==");
  d.getElementById("go").click(); await sleep(150);
  ok($("herbErr").textContent.includes("เลือกสมุนไพรอย่างน้อย 1 ชนิด") && $("out").hidden && w.__calls === 0, "ข้อความผิดพลาดที่ช่องสมุนไพร ไม่ส่งคำขอ");
  ok(d.activeElement === hs && hs.getAttribute("aria-invalid") === "true", "โฟกัสที่ dropdown + aria-invalid");
  pick(w, d, "herbAdd", "ขิง");
  ok(!hs.hasAttribute("aria-invalid") && $("herbErr").textContent === "", "เลือกแล้วล้าง aria-invalid และข้อความ");

  console.log("== 3) ขิง + กระเทียม + warfarin อายุ 60 ==");
  pick(w, d, "herbAdd", "กระเทียม"); pick(w, d, "drugAdd", "warfarin"); $("age").value = "60";
  ok(d.querySelectorAll("#herbSel .sel").length === 2 && !!d.querySelector('#drugSel [data-v="warfarin"]') && $("herbHint").textContent.includes("เลือกแล้ว 2"), "เลือกสมุนไพร 2 ชนิด + ชิปยา + สรุปจำนวน");
  await submit(d);
  const head = $("resHead");
  ok(head && /^พบธงเตือน/.test(head.textContent) && d.activeElement === head, `หัวข้อผล + โฟกัสย้ายไปที่หัวข้อ: "${head && head.textContent}"`);
  const kids = [...$("p1").children], iScope = kids.findIndex((k) => k.classList.contains("scope")), iList = kids.findIndex((k) => k.classList.contains("flags"));
  ok(iScope > 0 && iScope < iList, "กล่องขอบเขต+ไม่ใช่การวินิจฉัย อยู่ก่อนรายการธง");
  const items = [...$("p1").querySelectorAll("ul.flags > li")];
  ok($("p1").querySelector("ul.flags").getAttribute("aria-label") === "ธงเตือน" && items.length >= 3 && items.every((f) => f.querySelector("svg[aria-hidden]") && f.querySelector(".sev span").textContent.length > 2), `ธงเป็นรายการ (ul/li) ${items.length} ข้อ ทุกข้อมีไอคอน+คำ`);
  const chips = [...items.find((f) => f.querySelector(".ev")).querySelectorAll(".chip")].map((c) => c.textContent);
  ok(chips.some((c) => /^ชั้นหลักฐาน [AC]$/.test(c)) && chips.some((c) => /^หน้า \d+$/.test(c)) && chips.some((c) => c.startsWith("ร่าง")) && chips.some((c) => /^กฎ R\d$/.test(c)), `แถวหลักฐานครบ: ${chips.join(" | ")}`);
  const evd = [...$("p1").querySelectorAll("li.flag details.evd")];
  ok(evd.length >= 2 && evd.every((x) => !x.open && x.querySelector("summary").textContent === "ดูหลักฐานในหนังสือ"), `ธงที่มีหลักฐานต้นทางมีปุ่ม 'ดูหลักฐานในหนังสือ' (พับไว้) ${evd.length} ใบ`);
  ok(evd.every((x) => /^“.{2,250}”$/.test(x.querySelector("blockquote").textContent) && /หน้า \d+ \(หน้า \d+ ในไฟล์ PDF\)/.test(x.textContent) && /ข้อความเต็มและบริบทอยู่ในเล่ม/.test(x.textContent)), "แสดงวลีสั้น (<=250 ตัวอักษร) + หน้าพิมพ์/หน้า PDF + ข้อความว่าฉบับเต็มอยู่ในเล่ม");
  const more = [...$("p1").querySelectorAll("details")].find((x) => x.textContent.includes("ชั้นหลักฐาน A/B/C"));
  ok(!!more && !more.open && !!more.querySelector("h3"), "'เพิ่มเติม' พับไว้ และใช้หัวข้อ h3");
  ok(/ไม่ได้ตรวจเงื่อนไข \(ไม่ได้กรอก\): การตั้งครรภ์/.test($("p1").textContent), "ไม่ได้ตอบตั้งครรภ์ + ขิงมีกฎตั้งครรภ์ -> แจ้ง ไม่ได้ตรวจ");

  console.log("== 4) แท็บ + ใบสรุปเภสัชกร ==");
  const tabs = $("t1").parentElement;
  const key = (k) => tabs.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));
  ok(tabs.getAttribute("aria-label") === "มุมมองผลลัพธ์" && $("out").getAttribute("aria-label") === "ผลลัพธ์" && $("p1").getAttribute("tabindex") === "0" && $("p2").getAttribute("tabindex") === "0", "ชื่อ tablist/region ไม่ซ้ำกัน + แผงแท็บรับโฟกัสได้");
  key("ArrowRight"); ok(!$("p2").hidden && $("t2").tabIndex === 0 && $("t1").tabIndex === -1, "ลูกศรขวา -> แท็บ 3");
  key("Home"); ok(!$("p1").hidden && $("t1").tabIndex === 0, "Home -> แท็บ 2");
  key("End"); ok(!$("p2").hidden, "End -> แท็บ 3");
  const th = [...$("p2").querySelectorAll("th")].map((x) => x.textContent);
  ok(["ความรุนแรง", "ชั้นหลักฐาน", "หน้า", "สถานะข้อมูล", "กฎ", "วลีหลักฐาน (ไว้ตรวจเทียบ)"].every((h) => th.includes(h)) && !!$("p2").querySelector("table caption") && $("p2").querySelectorAll("h3").length >= 2, "ตารางมีคอลัมน์บังคับ + caption + หัวข้อ h3");
  ok(!/\[(avoid|caution|info)\]|verified/.test($("p2").textContent) && $("p2").textContent.includes("อายุ: 60 ปี"), "ใบสรุปเป็นภาษาไทย + โปรไฟล์");

  console.log("== 5) แก้ข้อมูลหลังได้ผล ==");
  d.querySelector('#drugSel [data-v="warfarin"] button').click();
  ok($("out").hidden && !d.querySelector('#drugSel [data-v="warfarin"]'), "ลบชิปยา -> ซ่อนผลเก่า");
  ok((await live(d)).includes("ผลเดิมถูกซ่อน") , "ประกาศว่าผลเดิมถูกซ่อน (ไม่เงียบ)");

  console.log("== 6) ไม่พบธง ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "กระชาย"); $("age").value = "30"; await submit(d);
  ok($("resHead").textContent === "ไม่พบธงเตือนในฐานข้อมูลนี้" && !$("p1").querySelector("ul.flags"), `หัวข้อ: "${$("resHead").textContent}" ไม่มีรายการธง`);
  ok($("p1").querySelector(".nonote").textContent === "นี่ไม่ได้แปลว่าปลอดภัย โปรดปรึกษาเภสัชกร" && !!$("p1").querySelector(".scope"), "มีบรรทัด 'ไม่ได้แปลว่าปลอดภัย' + ขอบเขต");
  ok(!$("p1").querySelector("[class*=ok],[class*=success],[class*=green]") && !/ไม่ได้ตรวจเงื่อนไข/.test($("p1").textContent), "ไม่มีสไตล์ ผ่าน/เขียว และไม่เตือนเงื่อนไขที่กระชายไม่มีกฎ");

  console.log("== 7) ข้อความฝัง HTML (XSS) ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); $("otherDrugs").value = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'; await submit(d);
  ok(w.__xss === undefined && !$("p1").querySelector("img") && !$("p1").querySelector("script") && $("p1").textContent.includes("<img src=x"), "ไม่มี element/สคริปต์ แสดงเป็นข้อความธรรมดา");

  console.log("== 8) ปุ่ม AI (ไม่มี key) + ปุ่มที่กำลังทำงาน ==");
  ({ w, d, $ } = await load());
  $("freeText").value = "กินขิง"; $("parseBtn").click();
  ok($("parseBtn").getAttribute("aria-disabled") === "true" && !$("parseBtn").disabled, "ระหว่างทำงานใช้ aria-disabled (ไม่ใช้ disabled จึงไม่เสียโฟกัส)");
  await waitFor(() => $("parseMsg").textContent.includes("ใช้ AI ไม่ได้"));
  ok($("parseMsg").textContent.includes("กรอกในฟอร์มเองได้") && $("parseBtn").getAttribute("aria-disabled") === "false", `ข้อความ: ${$("parseMsg").textContent}`);
  $("freeText").value = ""; $("parseBtn").click(); ok($("parseMsg").textContent === "พิมพ์ข้อความก่อน" && d.activeElement === $("freeText"), "ไม่ได้พิมพ์ -> โฟกัสกลับช่องข้อความ");
  pick(w, d, "herbAdd", "ขิง"); pick(w, d, "drugAdd", "warfarin"); await submit(d);
  const ex = [...d.querySelectorAll("#p1 button")].find((b) => b.textContent.includes("ให้ AI เรียบเรียง"));
  ok(!!ex && ex.textContent.startsWith("ตัวเลือก"), "ปุ่มเรียบเรียงเป็น 'ตัวเลือก' (รอง)");
  ex.click(); await waitFor(() => $("explainBox").textContent.includes("ใช้ข้อความจากธงโดยตรง"));
  ok($("explainBox").textContent.includes("ใช้ข้อความจากธงโดยตรง ไม่ได้ผ่าน AI") && ex.getAttribute("aria-disabled") === "false", "ไม่มี key -> ใช้ข้อความจากธง ติดป้ายที่มา");

  console.log("== 9) R3 + โรค/สภาวะ ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "รางจืด"); pick(w, d, "herbAdd", "มะแว้งเครือ"); pick(w, d, "drugAdd", "metformin"); pick(w, d, "condAdd", "เบาหวาน"); $("age").value = "58"; await submit(d);
  ok([...$("p1").querySelectorAll("ul.flags > li .sev")].some((s) => s.textContent.includes("ภาระความเสี่ยงรวม")), "แสดง 'ภาระความเสี่ยงรวม' ในรายการ");
  ok(/โรค\/สภาวะ: .*เบาหวาน/.test($("p2").textContent), "โรคที่เลือกถูกส่งและแสดงในใบสรุป");

  console.log("== 10) ตั้งครรภ์: ใช่ / ไม่ใช่ / ไม่ระบุ ==");
  for (const [val, expectFlag, expectUnchecked] of [["yes", true, false], ["no", false, false], ["", false, true]]) {
    ({ w, d, $ } = await load());
    pick(w, d, "herbAdd", "ขิง"); $("age").value = "30"; $("pregnant").value = val; await submit(d);
    const t = $("p1").textContent;
    ok((/ไม่แนะนำให้ใช้ขิงบรรเทาคลื่นไส้อาเจียนในสตรีมีครรภ์/.test(t) === expectFlag) && (/ไม่ได้ตรวจเงื่อนไข \(ไม่ได้กรอก\): การตั้งครรภ์/.test(t) === expectUnchecked), `ตั้งครรภ์="${val || "ไม่ระบุ"}" -> ธง=${expectFlag} ไม่ได้ตรวจ=${expectUnchecked}`);
  }

  console.log("== 11) โครงสร้างการเข้าถึง (ชื่อ/ARIA/id) ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); pick(w, d, "drugAdd", "warfarin"); pick(w, d, "condAdd", "เบาหวาน"); await submit(d);
  const ctrls = [...d.querySelectorAll("button, select, input:not([type=hidden]), textarea, summary")];
  const noName = ctrls.filter((e) => !accName(e, d) && e.tagName !== "SUMMARY");
  ok(noName.length === 0, `ทุกปุ่ม/ช่องกรอก (${ctrls.length} ตัว) มีชื่อ${noName.length ? " ขาด: " + noName.map((e) => e.id || e.outerHTML.slice(0, 40)).join(", ") : ""}`);
  const lin = [...d.querySelectorAll("button[aria-label]")].filter((b) => b.textContent.trim() && b.textContent.trim() !== "×" && !b.getAttribute("aria-label").includes(b.textContent.trim()));
  ok(lin.length === 0, `ชื่อที่โปรแกรมอ่านเสียงมีคำที่เห็นอยู่ด้วย (สั่งด้วยเสียงได้)${lin.length ? " ผิด: " + lin.map((b) => b.textContent).join(",") : ""}`);
  ok([...d.querySelectorAll('#drugSel button, #condSel button, #herbSel .sel button')].every((b) => /^ลบ /.test(b.getAttribute("aria-label"))), "ปุ่มลบทุกตัวชื่อไม่ซ้ำและขึ้นต้นด้วย 'ลบ'");
  ok(d.querySelectorAll("div[aria-label]:not([role])").length === 0, "ไม่มี div ที่มี aria-label โดยไม่มี role");
  const ids = [...d.querySelectorAll("[id]")].map((e) => e.id);
  ok(ids.length === new Set(ids).size, "ไม่มี id ซ้ำ");
  const refs = [...d.querySelectorAll("[aria-controls],[aria-labelledby],[aria-describedby]")].flatMap((e) => ["aria-controls", "aria-labelledby", "aria-describedby"].flatMap((a) => (e.getAttribute(a) || "").split(/\s+/).filter(Boolean)));
  ok(refs.every((r) => d.getElementById(r)), "aria-controls/labelledby/describedby ชี้ไปที่ id ที่มีอยู่จริง");
  ok($("form").getAttribute("aria-labelledby") === "formHead" && !!$("formHead"), "ฟอร์มมีชื่อ");
  const fbSel = [...$("p1").querySelectorAll("details select")].map((s) => s.getAttribute("aria-label"));
  ok(fbSel.some((n) => /^ความเห็นต่อธงที่ 1 \(/.test(n)) && !fbSel.some((n) => /f\d/.test(n)), `ชื่อช่องความเห็นใช้ลำดับ+ชื่อสมุนไพร ไม่ใช่รหัสภายใน: ${fbSel[1]}`);

  console.log("== 12) ผลเก่าไม่โผล่ทับข้อมูลที่แก้ระหว่างรอ ==");
  ({ w, d, $ } = await load());
  w.__delay = 500;
  pick(w, d, "herbAdd", "ขิง"); $("age").value = "30"; d.getElementById("go").click();
  await sleep(50);
  ok(busy(d) && !$("go").disabled, "ระหว่างรอ: ปุ่มตรวจเป็น aria-disabled");
  d.getElementById("go").click(); await sleep(20);
  ok(w.__calls === 1, "กดซ้ำระหว่างรอ ไม่ส่งคำขอซ้อน");
  $("age").value = "70"; $("age").dispatchEvent(new w.Event("input", { bubbles: true }));  // ผู้ใช้แก้อายุระหว่างรอ
  await sleep(900);
  ok($("out").hidden && !$("resHead") && !busy(d), "ตอบกลับมาแล้ว แต่ผลของข้อมูลเก่าถูกทิ้ง ไม่แสดง และปุ่มกลับมาใช้ได้");

  console.log("== 13) ตรวจล้มเหลวแล้วไม่มีข้อมูลเก่าค้าง ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); pick(w, d, "drugAdd", "warfarin"); $("age").value = "60"; await submit(d);
  ok(!$("p2").hidden === false && $("p2").textContent.includes("ใบสรุปสำหรับเภสัชกร") && !$("t2").hidden, "มีผลและใบสรุปจากการตรวจครั้งแรก");
  w.__fail = true; d.getElementById("go").click(); await waitFor(() => !busy(d) && $("p1").textContent.includes("ตรวจไม่สำเร็จ"));
  ok($("p2").children.length === 0 && $("t2").hidden, "ตรวจล้มเหลว -> ล้างใบสรุปเก่า + ซ่อนแท็บ 3");
  ok(d.activeElement && d.activeElement.getAttribute("role") === "alert" && d.activeElement.textContent.includes("ตรวจไม่สำเร็จ"), "ข้อความผิดพลาดเป็น role=alert และโฟกัสอยู่ที่ข้อความ (ถูกอ่านออกเสียง)");
  $("t1").parentElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(!$("p1").hidden, "ลูกศรไม่พาไปแท็บที่ซ่อนอยู่");
  w.__fail = false; await submit(d);
  ok(!$("t2").hidden && $("p2").textContent.includes("ใบสรุปสำหรับเภสัชกร"), "ตรวจสำเร็จอีกครั้ง -> แท็บ 3 กลับมา");

  console.log("== 14) ตรวจอายุที่หน้าจอ ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); $("age").value = "200"; d.getElementById("go").click(); await sleep(150);
  ok($("ageErr").textContent.includes("0-120") && $("age").getAttribute("aria-invalid") === "true" && d.activeElement === $("age") && w.__calls === 0, "อายุ 200 -> ข้อความผูกกับช่อง + โฟกัส + ไม่ส่งคำขอ");
  $("age").value = "30"; $("age").dispatchEvent(new w.Event("input", { bubbles: true }));
  ok($("ageErr").textContent === "" && !$("age").hasAttribute("aria-invalid"), "แก้ค่าแล้วล้างข้อผิดพลาด");
  $("age").value = ""; await submit(d);
  ok(w.__calls === 1 && !$("out").hidden, "เว้นว่าง = ไม่ระบุ (ใช้ได้)");

  console.log(fails ? `\nสรุป: ล้มเหลว ${fails} ข้อ` : "\nสรุป: ผ่านทุกข้อ");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(2); });
