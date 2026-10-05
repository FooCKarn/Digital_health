// ทดสอบหน้าเว็บ public/index.html ด้วย jsdom กับเซิร์ฟเวอร์ในเครื่อง (ไม่ต้องมีเบราว์เซอร์ ไม่ใช้ API key)
// ติดตั้ง jsdom นอก repo (ไม่เพิ่ม dependency ให้ Vercel): mkdir $TEMP/domtest; cd $TEMP/domtest; npm i jsdom
// รัน: python scripts/dev_server.py 8765  แล้ว  NODE_PATH=<โฟลเดอร์ domtest>/node_modules node scripts/ui_dom_test.js http://127.0.0.1:8765
const { JSDOM } = require("jsdom");
const BASE = process.argv[2];
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  OK   " : "  FAIL ") + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }

async function load() {
  const dom = await JSDOM.fromURL(BASE + "/", {
    runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    beforeParse(w) { w.fetch = (u, o) => fetch(new URL(u, BASE), o); w.Element.prototype.scrollIntoView = () => {}; w.URL.createObjectURL = () => "blob:x"; w.URL.revokeObjectURL = () => {}; },
  });
  const w = dom.window, d = w.document;
  await waitFor(() => d.querySelectorAll("#herbList button").length > 0);
  return { w, d, $: (id) => d.getElementById(id) };
}
const clickHerb = (d, name) => [...d.querySelectorAll("#herbList button")].find((b) => b.textContent.includes(name)).click();
const clickDrug = (d, name) => [...d.querySelectorAll("#drugs button")].find((b) => b.dataset.name === name).click();
async function submit(w, d) { d.getElementById("go").click(); return waitFor(() => !d.getElementById("out").hidden && !d.getElementById("go").disabled); }

(async () => {
  console.log("== 1) โหลดหน้า + ค้นหา/เลือกสมุนไพร ==");
  let { w, d, $ } = await load();
  ok(d.querySelectorAll("#herbList button").length >= 21, `รายการสมุนไพร ${d.querySelectorAll("#herbList button").length} ชนิด`);
  ok(d.querySelectorAll("#drugs button").length >= 5, "ปุ่มยามีครบ");
  $("herbSearch").value = "กระ"; $("herbSearch").dispatchEvent(new w.Event("input", { bubbles: true }));
  const vis = [...d.querySelectorAll("#herbList button")].filter((b) => !b.hidden).map((b) => b.textContent);
  ok(vis.length >= 2 && vis.every((t) => t.includes("กระ")), `ค้นหา "กระ" เหลือ: ${vis.join(", ")}`);
  $("herbSearch").value = ""; $("herbSearch").dispatchEvent(new w.Event("input", { bubbles: true }));

  console.log("== 2) กด ตรวจ โดยไม่เลือกอะไร ==");
  d.getElementById("go").click(); await sleep(200);
  ok($("herbErr").textContent.includes("เลือกสมุนไพรอย่างน้อย 1 ชนิด") && $("out").hidden, "แสดงข้อความผิดพลาดที่ช่องสมุนไพร และไม่แสดงผลลัพธ์");
  ok(d.activeElement.id === "herbSearch", "ย้ายโฟกัสไปที่ช่องที่ผิด");

  console.log("== 3) ขิง + กระเทียม + warfarin อายุ 60 ==");
  clickHerb(d, "ขิง"); clickHerb(d, "กระเทียม"); clickDrug(d, "warfarin"); $("age").value = "60";
  ok(d.querySelectorAll(".sel").length === 2 && [...d.querySelectorAll("#herbList button")].filter((b) => !b.hidden && /ขิง|กระเทียม/.test(b.textContent)).length === 0, "เลือก 2 ชนิด การ์ดขึ้น และปุ่มเดิมถูกซ่อน");
  ok($("herbHint").textContent.includes("เลือกแล้ว 2"), "สรุปจำนวนที่เลือก");
  await submit(w, d);
  const head = $("resHead");
  ok(head && /^พบธงเตือน/.test(head.textContent), `หัวข้อผล: "${head && head.textContent}"`);
  ok(d.activeElement === head, "โฟกัสย้ายไปหัวข้อผล (ให้โปรแกรมอ่านหน้าจอประกาศ)");
  const kids = [...$("p1").children], iScope = kids.findIndex((k) => k.classList.contains("scope")), iFlag = kids.findIndex((k) => k.classList.contains("flag"));
  ok(iScope > 0 && iScope < iFlag, "กล่องขอบเขต+ข้อความไม่ใช่การวินิจฉัย อยู่ก่อนธงแรก");
  ok($("p1").querySelector(".scope").textContent.includes("ไม่ได้หมายความว่า") && $("p1").querySelector(".scope").textContent.includes("จาก 50 ชนิดในเล่ม"), "ขอบเขตระบุ 50 ชนิดในเล่ม และมี disclaimer");
  const flags = [...$("p1").querySelectorAll(".flag")];
  ok(flags.length >= 3, `มีการ์ด ${flags.length} ใบ (รวมภาระความเสี่ยงรวม)`);
  ok(flags.every((f) => f.querySelector("svg[aria-hidden]") && f.querySelector(".sev span").textContent.length > 2), "ทุกการ์ดมีไอคอน + ข้อความระดับความรุนแรง");
  const f0 = flags.find((f) => f.querySelector(".ev"));
  const chips = [...f0.querySelectorAll(".chip")].map((c) => c.textContent);
  ok(chips.some((c) => /^ชั้นหลักฐาน [AC]$/.test(c)) && chips.some((c) => /^หน้า \d+$/.test(c)) && chips.some((c) => c.startsWith("ร่าง")) && chips.some((c) => /^กฎ R\d$/.test(c)), `แถวหลักฐานครบ: ${chips.join(" | ")}`);
  ok(!!$("p1").querySelector("details"), "มีส่วนอธิบายชั้นหลักฐาน/ร่าง");
  ok(/ไม่ได้ตรวจเงื่อนไข \(ไม่ได้กรอก\): การตั้งครรภ์/.test($("p1").textContent), "ไม่ได้ตอบเรื่องตั้งครรภ์ + ขิงมีกฎตั้งครรภ์ -> แจ้ง ไม่ได้ตรวจ (ไม่ใช่ถือว่าไม่ได้ตั้งครรภ์)");
  ok(!$("p1").textContent.includes("ปลอดภัย") || $("p1").textContent.replace("ไม่ได้หมายความว่าปลอดภัย", "").indexOf("ปลอดภัย") === -1, "หน้าผลไม่ใช้คำว่าปลอดภัย (ยกเว้นเชิงปฏิเสธใน disclaimer)");

  console.log("== 4) แท็บใบสรุปเภสัชกร + คีย์บอร์ด ==");
  const tabs = $("t1").parentElement;
  tabs.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(!$("p2").hidden && $("p1").hidden && $("t2").getAttribute("aria-selected") === "true" && $("t2").tabIndex === 0 && $("t1").tabIndex === -1, "ลูกศรขวาสลับไปแท็บ 3 และจัดการ tabindex");
  const th = [...$("p2").querySelectorAll("th")].map((x) => x.textContent);
  ok(["ความรุนแรง", "ชั้นหลักฐาน", "หน้า", "สถานะข้อมูล", "กฎ"].every((h) => th.includes(h)), `ตารางใบสรุปมีคอลัมน์บังคับครบ: ${th.join(", ")}`);
  ok(!/\[(avoid|caution|info)\]|verified/.test($("p2").textContent), "ใบสรุปไม่มีคำอังกฤษ [avoid]/verified ปนอีกต่อไป");
  ok($("p2").textContent.includes("อายุ: 60 ปี"), "ใบสรุปแสดงโปรไฟล์อ่านง่าย");
  tabs.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  ok(!$("p1").hidden, "ลูกศรซ้ายกลับแท็บ 2");

  console.log("== 5) แก้ข้อมูลหลังได้ผล => ผลเก่าถูกซ่อน ==");
  clickDrug(d, "warfarin");
  ok($("out").hidden, "กดเปลี่ยนยา -> ซ่อนผลเก่า");

  console.log("== 6) ไม่พบธง (กระชาย ไม่มียา) ==");
  ({ w, d, $ } = await load());
  clickHerb(d, "กระชาย"); $("age").value = "30"; await submit(w, d);
  ok($("resHead").textContent === "ไม่พบธงเตือนในฐานข้อมูลนี้", `หัวข้อ: "${$("resHead").textContent}"`);
  ok($("p1").querySelectorAll(".flag").length === 0, "ไม่มีการ์ดธง");
  ok($("p1").querySelector(".nonote").textContent === "นี่ไม่ได้แปลว่าปลอดภัย โปรดปรึกษาเภสัชกร", "มีบรรทัด 'ไม่ได้แปลว่าปลอดภัย โปรดปรึกษาเภสัชกร'");
  ok(!!$("p1").querySelector(".scope"), "ยังแสดงขอบเขตตอนไม่พบธง");
  ok(!$("p1").querySelector("[class*=ok],[class*=success],[class*=green]"), "ไม่มี element สไตล์ 'ผ่าน/สำเร็จ/เขียว'");
  ok(!/ไม่ได้ตรวจเงื่อนไข/.test($("p1").textContent), "กระชายไม่มีกฎตั้งครรภ์/ให้นม จึงไม่ต้องเตือนเรื่องเงื่อนไขที่ไม่ได้กรอก");

  console.log("== 7) ข้อความฝัง HTML ในช่องยาอื่น (XSS) ==");
  ({ w, d, $ } = await load());
  clickHerb(d, "ขิง"); $("otherDrugs").value = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'; await submit(w, d);
  ok(w.__xss === undefined && !$("p1").querySelector("img") && !$("p1").querySelector("script"), "ไม่มี element/สคริปต์ถูกสร้างจากข้อความ");
  ok($("p1").textContent.includes("<img src=x"), "แสดงเป็นข้อความธรรมดา");

  console.log("== 8) ปุ่ม AI เมื่อไม่มี key ==");
  ({ w, d, $ } = await load());
  $("freeText").value = "กินขิง"; $("parseBtn").click();
  await waitFor(() => $("parseMsg").textContent.length > 12 && !$("parseBtn").disabled);
  ok($("parseMsg").textContent.includes("ใช้ AI ไม่ได้") && $("parseMsg").textContent.includes("กรอกในฟอร์มเองได้"), `ข้อความ: ${$("parseMsg").textContent}`);
  clickHerb(d, "ขิง"); clickDrug(d, "warfarin"); await submit(w, d);
  const ex = [...d.querySelectorAll("#p1 button")].find((b) => b.textContent.includes("ให้ AI เรียบเรียง"));
  ok(!!ex && ex.textContent.startsWith("ตัวเลือก"), "ปุ่มเรียบเรียงเป็น 'ตัวเลือก' (รอง)");
  ex.click(); await waitFor(() => $("explainBox").textContent.includes("ใช้ข้อความจากธงโดยตรง"));
  ok($("explainBox").textContent.includes("ใช้ข้อความจากธงโดยตรง ไม่ได้ผ่าน AI"), "ไม่มี key -> ใช้ข้อความจากธง และติดป้ายบอกที่มา");

  console.log("== 9) ภาระความเสี่ยงรวม ==");
  ({ w, d, $ } = await load());
  clickHerb(d, "รางจืด"); clickHerb(d, "มะแว้งเครือ"); clickDrug(d, "metformin"); $("age").value = "58"; await submit(w, d);
  ok([...$("p1").querySelectorAll(".flag .sev")].some((s) => s.textContent.includes("ภาระความเสี่ยงรวม")), "แสดงการ์ด 'ภาระความเสี่ยงรวม' ของ R3");

  console.log("== 10) ตั้งครรภ์: ใช่ / ไม่ใช่ / ไม่ระบุ ==");
  for (const [val, expectFlag, expectUnchecked] of [["yes", true, false], ["no", false, false], ["", false, true]]) {
    ({ w, d, $ } = await load());
    clickHerb(d, "ขิง"); $("age").value = "30"; $("pregnant").value = val; await submit(w, d);
    const t = $("p1").textContent;
    ok((/ไม่แนะนำให้ใช้ขิงบรรเทาคลื่นไส้อาเจียนในสตรีมีครรภ์/.test(t) === expectFlag) && (/ไม่ได้ตรวจเงื่อนไข \(ไม่ได้กรอก\): การตั้งครรภ์/.test(t) === expectUnchecked),
       `ตั้งครรภ์="${val || "ไม่ระบุ"}" -> ธง=${expectFlag} ไม่ได้ตรวจ=${expectUnchecked}`);
  }

  console.log(fails ? `\nสรุป: ล้มเหลว ${fails} ข้อ` : "\nสรุป: ผ่านทุกข้อ");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(2); });
