// ทดสอบหน้าเว็บ public/index.html ด้วย jsdom กับเซิร์ฟเวอร์ในเครื่อง (ไม่ต้องมีเบราว์เซอร์ ไม่ใช้ API key)
// ติดตั้ง jsdom นอก repo (ไม่เพิ่ม dependency ให้ Vercel): mkdir $TEMP/domtest; cd $TEMP/domtest; npm i jsdom
// รัน: python scripts/dev_server.py 8765  แล้ว  NODE_PATH=<โฟลเดอร์ domtest>/node_modules node scripts/ui_dom_test.js http://127.0.0.1:8765
// สำคัญ: ไฟล์นี้ทดสอบ "หน้าที่ dev_server เสิร์ฟ" ถ้ามี web/dist (หลัง npm run build) dev_server จะเสิร์ฟหน้าใหม่แทน public/index.html
//   และเทสต์นี้จะล้มเพราะทดสอบผิดหน้า ให้รันตอนที่ไม่มี web/dist (ลบหรือเปลี่ยนชื่อชั่วคราว) หน้าใหม่ทดสอบด้วย vitest ใน web/
// หมายเหตุ: jsdom ไม่ใช่เบราว์เซอร์/โปรแกรมอ่านหน้าจอจริง ตรวจโครงสร้าง โฟกัส และข้อความประกาศใน DOM เท่านั้น
const { JSDOM } = require("jsdom");
const BASE = process.argv[2];
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  OK   " : "  FAIL ") + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }

async function load(opts = {}) {
  const dom = await JSDOM.fromURL(BASE + "/", {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    beforeParse(w) {
      w.__calls = 0;
      // fetch ที่ควบคุมได้: หน่วงเวลา/จำลองเครือข่ายล่ม เฉพาะ /api/analyze (และ /api/ask ล่มได้)
      w.fetch = async (u, o) => {
        if (String(u).includes("/api/analyze")) { w.__calls++; if (w.__delay) await sleep(w.__delay); if (w.__fail) throw new Error("network down"); }
        if (String(u).includes("/api/ask")) {
          if (w.__askDelay) await sleep(w.__askDelay);
          if (w.__askFail) throw new Error("network down");
          if (w.__askResp) return new Response(w.__askResp.body, { status: w.__askResp.status, headers: { "Content-Type": "application/json" } });
        }
        return fetch(new URL(u, BASE), o);
      };
      w.Element.prototype.scrollIntoView = () => {}; w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {};
      // storage: เติมประวัติก่อนสคริปต์ทำงาน (จำลองโหลดหน้าใหม่ในแท็บเดิม) / storageThrows: จำลองโควตาเต็มหรือโหมดส่วนตัว
      if (opts.storage !== undefined) w.sessionStorage.setItem("hg_chat_v1", opts.storage);
      if (opts.storageThrows) w.Storage.prototype.setItem = () => { throw new Error("quota"); };
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
  ok(head && /^พบคำเตือน/.test(head.textContent) && d.activeElement === head, `หัวข้อผล + โฟกัสย้ายไปที่หัวข้อ: "${head && head.textContent}"`);
  const kids = [...$("p1").children], iScope = kids.findIndex((k) => k.classList.contains("scope")), iList = kids.findIndex((k) => k.classList.contains("flags"));
  ok(iScope > 0 && iScope < iList, "กล่องขอบเขต+ไม่ใช่การวินิจฉัย อยู่ก่อนรายการคำเตือน");
  const items = [...$("p1").querySelectorAll("ul.flags > li")];
  ok($("p1").querySelector("ul.flags").getAttribute("aria-label") === "คำเตือน" && items.length >= 3 && items.every((f) => f.querySelector("svg[aria-hidden]") && f.querySelector(".sev span").textContent.length > 2), `คำเตือนเป็นรายการ (ul/li) ${items.length} ข้อ ทุกข้อมีไอคอน+คำ`);
  const chips = [...items.find((f) => f.querySelector(".ev")).querySelectorAll(".chip")].map((c) => c.textContent);
  ok(chips.some((c) => /^ชั้นหลักฐาน [AC]$/.test(c)) && chips.some((c) => /^หน้า \d+$/.test(c)) && chips.some((c) => c.startsWith("ร่าง")) && chips.some((c) => /^กฎ R\d$/.test(c)), `แถวหลักฐานครบ: ${chips.join(" | ")}`);
  const evd = [...$("p1").querySelectorAll("li.flag details.evd")];
  ok(evd.length >= 2 && evd.every((x) => !x.open && x.querySelector("summary").textContent === "ดูหลักฐานในหนังสือ"), `คำเตือนที่มีหลักฐานต้นทางมีปุ่ม 'ดูหลักฐานในหนังสือ' (พับไว้) ${evd.length} ใบ`);
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

  console.log("== 6) ไม่พบคำเตือน ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "กระชาย"); $("age").value = "30"; await submit(d);
  ok($("resHead").textContent === "ไม่พบคำเตือนในฐานข้อมูลนี้" && !$("p1").querySelector("ul.flags"), `หัวข้อ: "${$("resHead").textContent}" ไม่มีรายการคำเตือน`);
  ok($("p1").querySelector(".nonote").textContent === "นี่ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม โปรดปรึกษาเภสัชกร" && !!$("p1").querySelector(".scope"), "มีบรรทัด 'ไม่ได้แปลว่าปลอดภัย' + ขอบเขต");
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
  ex.click(); await waitFor(() => $("explainBox").textContent.includes("ใช้ข้อความจากคำเตือนโดยตรง"));
  ok($("explainBox").textContent.includes("ใช้ข้อความจากคำเตือนโดยตรง ไม่ได้ผ่าน AI") && ex.getAttribute("aria-disabled") === "false", "ไม่มี key -> ใช้ข้อความจากคำเตือน ติดป้ายที่มา");

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
    ok((/ไม่แนะนำให้ใช้ขิงบรรเทาคลื่นไส้อาเจียนในสตรีมีครรภ์/.test(t) === expectFlag) && (/ไม่ได้ตรวจเงื่อนไข \(ไม่ได้กรอก\): การตั้งครรภ์/.test(t) === expectUnchecked), `ตั้งครรภ์="${val || "ไม่ระบุ"}" -> คำเตือน=${expectFlag} ไม่ได้ตรวจ=${expectUnchecked}`);
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
  ok(fbSel.some((n) => /^ความเห็นต่อคำเตือนที่ 1 \(/.test(n)) && !fbSel.some((n) => /f\d/.test(n)), `ชื่อช่องความเห็นใช้ลำดับ+ชื่อสมุนไพร ไม่ใช่รหัสภายใน: ${fbSel[1]}`);

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

  console.log("== 15) แชต: ปุ่มลอย เปิด/ปิด โฟกัส Esc ==");
  ({ w, d, $ } = await load());
  ok($("chatHead").getAttribute("aria-label") === "เปิดผู้ช่วย AI" && $("chatPanel").hidden && $("chatHead").getAttribute("aria-expanded") === "false", "ปุ่มแชตมีชื่อ และแผงปิดอยู่");
  $("chatHead").click();
  ok(!$("chatPanel").hidden && d.activeElement === $("chatInput") && $("chatHead").getAttribute("aria-expanded") === "true", "เปิดแล้วโฟกัสไปที่ช่องพิมพ์");
  ok($("chatPanel").getAttribute("role") === "dialog" && !!$("chatPanel").getAttribute("aria-label") && $("chatLog").getAttribute("role") === "log", "แผงเป็น dialog มีชื่อ และบทสนทนาเป็น log");
  ok(/ไม่ใช่การวินิจฉัย/.test($("chatNotice").textContent) && /จาก 50 ชนิด/.test($("chatNotice").textContent), "แถบคงที่: ไม่ใช่การวินิจฉัย + ขอบเขต 50 ชนิด");
  const meta15 = await (await fetch(BASE + "/api/meta")).json();
  ok($("chatNotice").textContent.includes(`กลุ่มยา ${meta15.coverage.drug_classes_in_db} กลุ่ม`), "แถบคงที่: ขอบเขตรวมจำนวนกลุ่มยา (กฎข้อ 5)");
  ok(JSON.stringify([...d.querySelectorAll("#chatChips button")].map((b) => b.textContent)) === JSON.stringify(meta15.chat_followups_th.slice(0, 3)), "ชิปเริ่มต้นมาจาก /api/meta (config) ไม่ฝังในหน้า");
  $("chatPanel").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok($("chatPanel").hidden && d.activeElement === $("chatHead"), "Esc ปิดแผงและโฟกัสกลับปุ่มแชต");

  console.log("== 16) แชต: ถาม-ตอบ ป้ายที่มา หลักฐาน ประวัติ ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); pick(w, d, "drugAdd", "warfarin"); $("age").value = "60"; await submit(d);
  $("chatHead").click();
  $("chatInput").value = "ขิงกับยากันเลือดเป็นลิ่ม"; $("chatForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => d.querySelectorAll("#chatLog .cmsg.a").length === 1 && !$("chatLog").hasAttribute("aria-busy") && $("chatLog").textContent.includes("จากฐานข้อมูลนี้"));
  const am = d.querySelector("#chatLog .cmsg.a");
  ok(d.querySelectorAll("#chatLog .cmsg.u").length === 1 && am.querySelector(".src").textContent === "ข้อความจากฐานข้อมูล" && am.textContent.includes("ขิง"), "ฟองผู้ใช้ + ฟองผู้ช่วยพร้อมป้ายที่มา");
  const ev = am.querySelector("details.evd");
  ok(!!ev && !ev.open && /^ดูหลักฐาน: ขิง/.test(ev.querySelector("summary").textContent) && /หน้า \d+ \(หน้า \d+ ในไฟล์ PDF\)/.test(ev.textContent), "ปุ่มดูหลักฐานในคำตอบ (พับไว้) พร้อมหน้า");
  const saved = JSON.parse(w.sessionStorage.getItem("hg_chat_v1"));
  ok(saved.v === 1 && saved.msgs.length === 2 && saved.msgs[0].r === "u" && !/\b(age|profile|pregnant|breastfeeding|conditions|drugs)\b/.test(JSON.stringify(saved)), "ประวัติอยู่ใน sessionStorage (ข้อความเท่านั้น ไม่มีโปรไฟล์)");
  ok(d.querySelectorAll("#chatChips button").length === 2, "มีชิปคำถามแนะนำ");
  d.querySelector("#chatChips button").click();
  await waitFor(() => d.querySelectorAll("#chatLog .cmsg.a").length === 2 && $("chatSend").getAttribute("aria-disabled") === "false");
  ok(d.querySelectorAll("#chatLog .cmsg.a")[1].textContent.includes("ขิง"), "กดชิป 'ทำไมถึงขึ้นคำเตือน' ได้คำตอบจากผลตรวจปัจจุบัน");
  const sav = w.sessionStorage.getItem("hg_chat_v1");
  ({ w, d, $ } = await load({ storage: sav }));
  ok(d.querySelectorAll("#chatLog .cmsg").length === 4, "โหลดหน้าใหม่ในแท็บเดียวกัน: ประวัติ 4 ข้อความกลับมา");
  $("chatHead").click(); $("chatClear").click();
  ok(d.querySelectorAll("#chatLog .cmsg").length === 0 && JSON.parse(w.sessionStorage.getItem("hg_chat_v1")).msgs.length === 0, "ล้างประวัติแล้วทั้งหน้าจอและ sessionStorage ว่าง");

  console.log("== 17) แชต: ฉุกเฉิน การปฏิเสธ ไม่มีผลตรวจ ==");
  ({ w, d, $ } = await load());
  $("chatHead").click();
  const ask = async (q, n) => { $("chatInput").value = q; $("chatForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); await waitFor(() => d.querySelectorAll("#chatLog .cmsg.a").length === n && $("chatSend").getAttribute("aria-disabled") === "false"); return [...d.querySelectorAll("#chatLog .cmsg.a")][n - 1]; };
  let m = await ask("หายใจไม่ออกหลังกินขิง", 1);
  ok(m.classList.contains("emerg") && m.getAttribute("role") === "alert" && m.textContent.includes("1669") && m.querySelector(".src").textContent === "ข้อควรทราบเร่งด่วน", "ฉุกเฉิน: ข้อความเร่งด่วน (role=alert) ไม่เรียก AI");
  m = await ask("ขิงกินวันละกี่เม็ด", 2); ok(/ไม่แนะนำขนาด/.test(m.textContent) && m.querySelector(".src").textContent === "ตอบไม่ได้ / ไม่มีข้อมูล", "ขอขนาดยา: ปฏิเสธ + ป้าย");
  m = await ask("ทำไมถึงขึ้นคำเตือน", 3); ok(m.textContent.includes("ยังไม่มีผลตรวจ"), "ยังไม่ตรวจ: บอกให้ตรวจก่อน (แชตใช้ได้ก่อนตรวจ)");
  m = await ask("รางจืดกับยาเบาหวาน", 4); ok(m.textContent.includes("รางจืด") && !!m.querySelector("details.evd"), "ถามเรื่องสมุนไพรที่ระบุชื่อได้แม้ยังไม่ตรวจ");
  m = await ask("ฟุตบอลคืออะไร", 5); ok(m.textContent.includes("ไม่พบข้อมูล"), "คำถามนอกฐาน: ไม่พบข้อมูล");
  m = await ask("ขิงกับ warfarin ปลอดภัยไหม", 6); ok(m.textContent.includes("ยังไม่มีผลตรวจ") && !/ใช้ได้|กินได้/.test(m.textContent), "ถามปลอดภัยไหมโดยยังไม่ตรวจ: ไม่ตอบใช่/ไม่ใช่");
  const sysText = (() => { const c = d.body.cloneNode(true); c.querySelectorAll(".cmsg.u").forEach((u) => u.remove()); return c.textContent; })();  // ไม่นับคำที่ผู้ใช้พิมพ์เอง
  ok(sysText.replace(/ไม่ได้(แปลว่า|หมายความว่า)ปลอดภัย/g, "").indexOf("ปลอดภัย") === -1, "ข้อความของระบบทั้งหน้าไม่มีคำว่า ปลอดภัย นอกเชิงปฏิเสธ (ไม่นับคำถามที่ผู้ใช้พิมพ์)");

  console.log("== 18) แชต: storage เสีย/ใช้ไม่ได้ + ผลตรวจเปลี่ยน + ปุ่มถามเรื่องคำเตือน ==");
  ({ w, d, $ } = await load({ storage: "{not json" }));
  $("chatHead").click(); $("chatInput").value = "รางจืดกับยาเบาหวาน"; $("chatForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => d.querySelectorAll("#chatLog .cmsg.a").length === 1 && $("chatSend").getAttribute("aria-disabled") === "false");
  ok(d.querySelectorAll("#chatLog .cmsg.a").length === 1, "sessionStorage เสีย (JSON พัง): แชตยังใช้ได้");
  ({ w, d, $ } = await load({ storageThrows: true }));
  $("chatHead").click(); $("chatInput").value = "รางจืดกับยาเบาหวาน"; $("chatForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => d.querySelectorAll("#chatLog .cmsg.a").length === 1 && $("chatSend").getAttribute("aria-disabled") === "false");
  ok(d.querySelectorAll("#chatLog .cmsg.a").length === 1, "setItem โยน error (โควตา/โหมดส่วนตัว): แชตยังใช้ได้ ไม่มีประวัติ");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); pick(w, d, "drugAdd", "warfarin"); $("age").value = "60"; await submit(d);
  const askBtn = d.querySelector("li.flag button.askflag");
  ok(!!askBtn && /^ถามเรื่องคำเตือนนี้/.test(askBtn.getAttribute("aria-label")) && askBtn.textContent === "ถามเรื่องคำเตือนนี้", "การ์ดคำเตือนมีปุ่ม 'ถามเรื่องคำเตือนนี้' (ชื่อขึ้นต้นด้วยคำที่เห็น)");
  askBtn.click();
  ok(!$("chatPanel").hidden && $("chatInput").value.startsWith("อธิบายคำเตือนของ") && d.activeElement === $("chatInput") && d.querySelectorAll("#chatLog .cmsg").length === 0, "กดแล้วเปิดแชตและเติมคำถามให้ (ยังไม่ส่งเอง)");
  $("chatForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => d.querySelectorAll("#chatLog .cmsg.a").length === 1 && $("chatSend").getAttribute("aria-disabled") === "false");
  d.querySelector('#drugSel [data-v="warfarin"] button').click();   // แก้ข้อมูล -> ผลเก่าถูกซ่อน
  ok([...d.querySelectorAll("#chatLog .cmsg.n")].some((n) => n.textContent.includes("ผลตรวจเปลี่ยนแล้ว")), "แก้ข้อมูลหลังคุยแล้ว: แชตแจ้งว่าคำตอบก่อนหน้าอาจไม่ตรงกับข้อมูลปัจจุบัน");

  console.log("== 19) แชต: API ล้มเหลว + ปุ่มกำลังทำงาน + ความเข้าถึง ==");
  ({ w, d, $ } = await load());
  w.__askFail = true; $("chatHead").click(); $("chatInput").value = "รางจืดกับยาเบาหวาน"; $("chatForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => d.querySelector("#chatLog .err") && $("chatSend").getAttribute("aria-disabled") === "false");
  ok(d.querySelector("#chatLog .err").getAttribute("role") === "alert" && d.querySelectorAll("#chatLog .cmsg.u").length === 1, "API ล้ม: ข้อความ role=alert และคำถามของผู้ใช้ยังอยู่ในประวัติ");
  const names = [...d.querySelectorAll(".chat-ui button, .chat-ui input")].filter((e) => !accName(e, d));
  ok(names.length === 0 && d.querySelectorAll("div[aria-label]:not([role])").length === 0, "ทุกปุ่ม/ช่องในแผงแชตมีชื่อ ไม่มี div ที่มี aria-label โดยไม่มี role");
  const ids2 = [...d.querySelectorAll("[id]")].map((e) => e.id); ok(ids2.length === new Set(ids2).size, "ไม่มี id ซ้ำ");
  ok($("chatInput").maxLength === 300, "ช่องพิมพ์จำกัด 300 ตัวอักษร");
  const x = "<img src=x onerror=\"window.__xss=1\">"; w.__askFail = false; $("chatInput").value = x; $("chatForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => $("chatSend").getAttribute("aria-disabled") === "false" && d.querySelectorAll("#chatLog .cmsg.a").length >= 1);
  ok(w.__xss === undefined && !d.querySelector("#chatLog img") && [...d.querySelectorAll("#chatLog .cmsg.u")].some((u) => u.textContent === x), "คำถามฝัง HTML แสดงเป็นข้อความธรรมดา");

  // ส่งคำถามแล้วรอคำตอบ/ข้อผิดพลาดลำดับที่ n (ใช้ในสถานการณ์ 20-22)
  const send = (q) => { $("chatInput").value = q; $("chatForm").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); };
  const askN = async (q, n) => { send(q); await waitFor(() => d.querySelectorAll("#chatLog .cmsg.a").length === n && $("chatSend").getAttribute("aria-disabled") === "false"); return [...d.querySelectorAll("#chatLog .cmsg.a")][n - 1]; };
  const errN = async (q, n) => { send(q); await waitFor(() => d.querySelectorAll("#chatLog .err").length === n && $("chatSend").getAttribute("aria-disabled") === "false"); return [...d.querySelectorAll("#chatLog .err")][n - 1]; };
  const STL = "อ้างอิงผลตรวจก่อนที่คุณจะแก้ข้อมูล";

  console.log("== 20) แชต: ตรวจแล้วไม่พบคำเตือน แล้วถาม 'ปลอดภัยไหม' ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "กระชาย"); $("age").value = "30"; await submit(d);
  ok($("resHead").textContent === "ไม่พบคำเตือนในฐานข้อมูลนี้", "ผลตรวจ: ไม่พบคำเตือน");
  $("chatHead").click();
  m = await askN("กระชายปลอดภัยไหม", 1);
  ok(!!m && m.textContent.includes("ไม่พบคำเตือนในฐานข้อมูลนี้"), "คำตอบมี 'ไม่พบคำเตือนในฐานข้อมูลนี้' (ไม่ตอบว่าใช้ได้)");
  const sys20 = (() => { const c = d.body.cloneNode(true); c.querySelectorAll(".cmsg.u").forEach((u) => u.remove()); return c.textContent; })();
  // รูปปฏิเสธที่ยอมรับ: ไม่ได้แปลว่า/ไม่ได้หมายความว่าปลอดภัย (รูปหลังมาจาก disclaimer_th ใน data/config.json เดิม) เกณฑ์เดียวกับสถานการณ์ 0
  ok(sys20.replace(/ไม่ได้(แปลว่า|หมายความว่า)ปลอดภัย/g, "").indexOf("ปลอดภัย") === -1, "ข้อความของระบบไม่มีคำว่า ปลอดภัย นอกเชิงปฏิเสธ");

  console.log("== 21) แชต: แก้ข้อมูลแล้วถามต่อ / แก้ระหว่างรอคำตอบ -> คำตอบติดป้ายผลตรวจเดิม ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); pick(w, d, "drugAdd", "warfarin"); $("age").value = "60"; await submit(d);
  $("chatHead").click();
  m = await askN("ทำไมถึงขึ้นคำเตือน", 1); ok(!!m && !m.querySelector(".stl"), "ผลตรวจปัจจุบัน: คำตอบไม่มีป้ายผลเดิม");
  d.querySelector('#drugSel [data-v="warfarin"] button').click();   // แก้ข้อมูล -> ผลเก่าถูกซ่อน
  const m2 = await askN("ทำไมถึงขึ้นคำเตือน", 2), m3 = await askN("ควรถามเภสัชกรว่าอะไร", 3);
  ok([m2, m3].every((x) => x && x.querySelector(".stl") && x.querySelector(".stl").textContent.startsWith(STL)), "แก้ข้อมูลแล้วถาม 2 ครั้ง: ทั้งสองคำตอบมีป้าย 'อ้างอิงผลตรวจก่อนที่คุณจะแก้ข้อมูล'");
  await submit(d);
  m = await askN("ทำไมถึงขึ้นคำเตือน", 4); ok(!!m && !m.querySelector(".stl"), "ตรวจใหม่แล้ว: คำตอบถัดไปไม่มีป้าย");
  w.__askDelay = 400; send("ทำไมถึงขึ้นคำเตือน"); await sleep(60);
  $("age").value = "61"; $("age").dispatchEvent(new w.Event("input", { bubbles: true }));   // แก้ระหว่างรอคำตอบ
  await waitFor(() => d.querySelectorAll("#chatLog .cmsg.a").length === 5 && $("chatSend").getAttribute("aria-disabled") === "false");
  m = [...d.querySelectorAll("#chatLog .cmsg.a")][4];
  ok(!!m && !!m.querySelector(".stl") && m.querySelector(".stl").textContent.startsWith(STL), "แก้ข้อมูลระหว่างรอคำตอบ: คำตอบที่มาถึงทีหลังมีป้ายผลเดิม");
  ok(JSON.parse(w.sessionStorage.getItem("hg_chat_v1")).msgs.filter((x) => x.old).length === 3, "ป้ายผลเดิมถูกเก็บในประวัติ (3 คำตอบ)");

  console.log("== 22) แชต: ล้างประวัติระหว่างรอ + ข้อความผิดพลาดเป็นภาษาไทย ==");
  ({ w, d, $ } = await load());
  $("chatHead").click();
  w.__askDelay = 300; send("รางจืดกับยาเบาหวาน"); await sleep(60); $("chatClear").click();
  await waitFor(() => $("chatSend").getAttribute("aria-disabled") === "false"); await sleep(50);
  ok(d.querySelectorAll("#chatLog .cmsg, #chatLog .err").length === 0 && JSON.parse(w.sessionStorage.getItem("hg_chat_v1")).msgs.length === 0, "ล้างประวัติระหว่างรอ: คำตอบที่มาทีหลังไม่ค้างอยู่ในแชตหรือประวัติ");
  w.__askDelay = 0;
  w.__askResp = { status: 500, body: JSON.stringify({ error: "server_error", detail: "KeyError: boom" }) };
  let er = await errN("รางจืด", 1);
  ok(!!er && er.textContent.includes("ระบบขัดข้อง") && !/server_error|KeyError/.test(er.textContent) && er.getAttribute("role") === "alert", `500: ข้อความไทยตายตัว ไม่โชว์รหัสภายใน (${er && er.textContent})`);
  w.__askResp = { status: 200, body: "not json" };
  er = await errN("รางจืด", 2); ok(!!er && er.textContent.includes("ระบบขัดข้อง"), "คำตอบอ่านไม่ได้ (ไม่ใช่ JSON): ข้อความไทยตายตัว");
  w.__askResp = { status: 400, body: JSON.stringify({ error: "bad thing" }) };
  er = await errN("รางจืด", 3); ok(!!er && er.textContent.includes("คำถามหรือข้อมูลไม่ถูกต้อง") && !er.textContent.includes("bad thing"), "400 ข้อความไม่ใช่ภาษาไทย: ใช้ข้อความไทยตายตัว");
  w.__askResp = { status: 400, body: JSON.stringify({ error: "question ต้องเป็นข้อความ 1-300 ตัวอักษร" }) };
  er = await errN("รางจืด", 4); ok(!!er && er.textContent.includes("question ต้องเป็นข้อความ 1-300 ตัวอักษร"), "400 ข้อความไทยจากเซิร์ฟเวอร์: แสดงตามเดิม");
  w.__askResp = { status: 503, body: JSON.stringify({ error: "llm_unavailable", message: "บริการ AI ใช้ไม่ได้ชั่วคราว" }) };
  er = await errN("รางจืด", 5); ok(!!er && er.textContent.includes("บริการ AI ใช้ไม่ได้ชั่วคราว"), "503: คงข้อความจากเซิร์ฟเวอร์");

  console.log("== 23) แชต: ถาม 'กินได้ไหม' เรื่องที่ไม่ได้กรอก -> ไม่ตอบ 'ไม่พบคำเตือน' ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); $("age").value = "30"; await submit(d);
  $("chatHead").click();
  m = await askN("ขิงกับวาร์ฟารินกินได้ไหม", 1);
  ok(!!m && !m.textContent.includes("ไม่พบคำเตือน") && m.textContent.includes("ไม่ควรรับประทาน") && !!m.querySelector("details.evd"), "ยาที่ไม่ได้กรอก: แสดงคำเตือนจากฐานข้อมูลพร้อมหลักฐาน ไม่บอกว่าไม่พบคำเตือน");
  m = await askN("ขิงปลอดภัยไหม", 2);
  ok(!!m && m.textContent.includes("ไม่พบคำเตือนในฐานข้อมูลนี้"), "ถามเฉพาะสิ่งที่ตรวจแล้วและไม่มีคำเตือน: ยังใช้ข้อความไม่พบคำเตือนมาตรฐาน");

  console.log(fails ? `\nสรุป: ล้มเหลว ${fails} ข้อ` : "\nสรุป: ผ่านทุกข้อ");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(2); });
