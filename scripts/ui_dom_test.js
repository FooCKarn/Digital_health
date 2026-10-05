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
  await waitFor(() => d.querySelectorAll("#herbAdd option").length > 1);
  return { w, d, $: (id) => d.getElementById(id) };
}
// เลือกจาก dropdown (เหมือนผู้ใช้เลือก option แล้วเกิด change)
function pick(w, d, selId, textPart) {
  const s = d.getElementById(selId), o = [...s.options].find((x) => x.textContent.includes(textPart) && !x.disabled);
  if (!o) throw new Error(`ไม่พบตัวเลือก '${textPart}' ใน ${selId}`);
  s.value = o.value; s.dispatchEvent(new w.Event("change", { bubbles: true })); s.dispatchEvent(new w.Event("input", { bubbles: true }));
}
async function submit(d) { d.getElementById("go").click(); return waitFor(() => !d.getElementById("out").hidden && !d.getElementById("go").disabled); }

(async () => {
  console.log("== 0) SEO / โครงสร้างหน้า ==");
  let { w, d, $ } = await load();
  ok(d.title.includes("HerbGuard TTM") && d.documentElement.lang === "th", `title: "${d.title}"`);
  ok(d.querySelector('meta[name=description]').content.length > 60, "มี meta description");
  ok(d.querySelector('meta[name=robots]').content === "noindex, nofollow", "robots = noindex, nofollow (ข้อมูลยังเป็นร่าง)");
  ok(d.querySelectorAll("h1").length === 1 && !!d.querySelector("header") && !!d.querySelector("main") && !!d.querySelector("footer"), "h1 เดียว + header/main/footer");
  let ld = null; try { ld = JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent); } catch (e) {}
  ok(ld && ld["@type"] === "WebApplication", "JSON-LD อ่านได้");
  ok(!d.querySelector('link[rel=canonical]') && !d.querySelector('meta[property="og:url"]') && !d.querySelector('meta[property="og:image"]'), "ไม่มี canonical/og:url/og:image ที่เดาเอา");
  ok(d.body.textContent.replace(/ไม่ได้(แปลว่า|หมายความว่า)ปลอดภัย/g, "").indexOf("ปลอดภัย") === -1, "ไม่มีคำว่า ปลอดภัย นอกเชิงปฏิเสธ (ไม่ได้แปลว่า/ไม่ได้หมายความว่า)");

  console.log("== 1) dropdown ==");
  ok(d.querySelectorAll("#herbAdd option").length - 1 >= 21, `dropdown สมุนไพร ${d.querySelectorAll("#herbAdd option").length - 1} ชนิด`);
  ok(d.querySelectorAll("#drugAdd option").length - 1 >= 5 && d.querySelectorAll("#condAdd option").length - 1 >= 20, "dropdown ยา/โรค มีตัวเลือก");
  ok(d.querySelectorAll('input[type=checkbox]').length === 0, "ไม่มีช่องติ๊กรกหน้าอีกต่อไป");
  pick(w, d, "herbAdd", "ขิง");
  const row = d.querySelector("#herbSel .sel");
  ok(!!row && row.querySelector(".part") && row.querySelector(".days") && row.querySelector("button"), "เลือกแล้วขึ้นแถวเดียว: ชื่อ + ส่วนที่ใช้ + วัน + ลบ");
  ok([...d.querySelectorAll("#herbAdd option")].find((o) => o.textContent === "ขิง").disabled, "ตัวเลือกที่เลือกแล้วถูกซ่อน/ปิด");
  row.querySelector("button").click();
  ok(d.querySelectorAll("#herbSel .sel").length === 0 && ![...d.querySelectorAll("#herbAdd option")].find((o) => o.textContent === "ขิง").disabled, "ลบแล้วตัวเลือกกลับมา");

  console.log("== 2) กด ตรวจ โดยไม่เลือกอะไร ==");
  d.getElementById("go").click(); await sleep(200);
  ok($("herbErr").textContent.includes("เลือกสมุนไพรอย่างน้อย 1 ชนิด") && $("out").hidden, "ข้อความผิดพลาดที่ช่องสมุนไพร ไม่แสดงผล");
  ok(d.activeElement.id === "herbAdd", "โฟกัสย้ายไป dropdown สมุนไพร");

  console.log("== 3) ขิง + กระเทียม + warfarin อายุ 60 ==");
  pick(w, d, "herbAdd", "ขิง"); pick(w, d, "herbAdd", "กระเทียม"); pick(w, d, "drugAdd", "warfarin"); $("age").value = "60";
  ok(d.querySelectorAll("#herbSel .sel").length === 2 && !!d.querySelector('#drugSel [data-v="warfarin"]'), "เลือกสมุนไพร 2 ชนิด + ชิปยา");
  ok($("herbHint").textContent.includes("เลือกแล้ว 2"), "สรุปจำนวนที่เลือก");
  await submit(d);
  const head = $("resHead");
  ok(head && /^พบธงเตือน/.test(head.textContent), `หัวข้อผล: "${head && head.textContent}"`);
  ok(d.activeElement === head, "โฟกัสย้ายไปหัวข้อผล");
  const kids = [...$("p1").children], iScope = kids.findIndex((k) => k.classList.contains("scope")), iFlag = kids.findIndex((k) => k.classList.contains("flag"));
  ok(iScope > 0 && iScope < iFlag, "กล่องขอบเขต+ไม่ใช่การวินิจฉัย อยู่ก่อนธงแรก");
  ok($("p1").querySelector(".scope").textContent.includes("จาก 50 ชนิดในเล่ม") && $("p1").querySelector(".scope").textContent.includes("ไม่ได้หมายความว่า"), "ขอบเขตระบุ 50 ชนิด + disclaimer");
  const flags = [...$("p1").querySelectorAll(".flag")];
  ok(flags.length >= 3 && flags.every((f) => f.querySelector("svg[aria-hidden]") && f.querySelector(".sev span").textContent.length > 2), `การ์ด ${flags.length} ใบ ทุกใบมีไอคอน+คำ`);
  const chips = [...flags.find((f) => f.querySelector(".ev")).querySelectorAll(".chip")].map((c) => c.textContent);
  ok(chips.some((c) => /^ชั้นหลักฐาน [AC]$/.test(c)) && chips.some((c) => /^หน้า \d+$/.test(c)) && chips.some((c) => c.startsWith("ร่าง")) && chips.some((c) => /^กฎ R\d$/.test(c)), `แถวหลักฐานครบ: ${chips.join(" | ")}`);
  const more = [...$("p1").querySelectorAll("details")].find((x) => x.textContent.includes("ชั้นหลักฐาน A/B/C"));
  ok(!!more && !more.open && more.textContent.includes("ช่วยเราปรับปรุง"), "'เพิ่มเติม' พับไว้ รวมอธิบายชั้นหลักฐาน + feedback");
  ok(/ไม่ได้ตรวจเงื่อนไข \(ไม่ได้กรอก\): การตั้งครรภ์/.test($("p1").textContent), "ไม่ได้ตอบตั้งครรภ์ + ขิงมีกฎตั้งครรภ์ -> แจ้ง ไม่ได้ตรวจ");

  console.log("== 4) แท็บใบสรุปเภสัชกร + คีย์บอร์ด ==");
  const tabs = $("t1").parentElement;
  tabs.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(!$("p2").hidden && $("p1").hidden && $("t2").tabIndex === 0 && $("t1").tabIndex === -1, "ลูกศรขวาสลับแท็บ + tabindex");
  const th = [...$("p2").querySelectorAll("th")].map((x) => x.textContent);
  ok(["ความรุนแรง", "ชั้นหลักฐาน", "หน้า", "สถานะข้อมูล", "กฎ"].every((h) => th.includes(h)), "ตารางใบสรุปมีคอลัมน์บังคับครบ");
  ok(!/\[(avoid|caution|info)\]|verified/.test($("p2").textContent) && $("p2").textContent.includes("อายุ: 60 ปี"), "ใบสรุปเป็นภาษาไทย + แสดงโปรไฟล์");
  tabs.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  ok(!$("p1").hidden, "ลูกศรซ้ายกลับ");

  console.log("== 5) แก้ข้อมูลหลังได้ผล => ผลเก่าถูกซ่อน ==");
  d.querySelector('#drugSel [data-v="warfarin"] button').click();
  ok($("out").hidden && !d.querySelector('#drugSel [data-v="warfarin"]'), "ลบชิปยา -> ซ่อนผลเก่า");
  ok(![...d.querySelectorAll("#drugAdd option")].find((o) => o.textContent === "warfarin").disabled, "ตัวเลือก warfarin กลับมา");

  console.log("== 6) ไม่พบธง (กระชาย ไม่มียา) ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "กระชาย"); $("age").value = "30"; await submit(d);
  ok($("resHead").textContent === "ไม่พบธงเตือนในฐานข้อมูลนี้" && $("p1").querySelectorAll(".flag").length === 0, `หัวข้อ: "${$("resHead").textContent}" ไม่มีการ์ดธง`);
  ok($("p1").querySelector(".nonote").textContent === "นี่ไม่ได้แปลว่าปลอดภัย โปรดปรึกษาเภสัชกร" && !!$("p1").querySelector(".scope"), "มีบรรทัด 'ไม่ได้แปลว่าปลอดภัย' + ขอบเขต");
  ok(!$("p1").querySelector("[class*=ok],[class*=success],[class*=green]") && !/ไม่ได้ตรวจเงื่อนไข/.test($("p1").textContent), "ไม่มีสไตล์ ผ่าน/เขียว และไม่เตือนเงื่อนไขที่กระชายไม่มีกฎ");

  console.log("== 7) ข้อความฝัง HTML (XSS) ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "ขิง"); $("otherDrugs").value = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'; await submit(d);
  ok(w.__xss === undefined && !$("p1").querySelector("img") && !$("p1").querySelector("script") && $("p1").textContent.includes("<img src=x"), "ไม่มี element/สคริปต์ แสดงเป็นข้อความธรรมดา");

  console.log("== 8) ปุ่ม AI เมื่อไม่มี key ==");
  ({ w, d, $ } = await load());
  $("freeText").value = "กินขิง"; $("parseBtn").click();
  await waitFor(() => $("parseMsg").textContent.length > 12 && !$("parseBtn").disabled);
  ok($("parseMsg").textContent.includes("ใช้ AI ไม่ได้") && $("parseMsg").textContent.includes("กรอกในฟอร์มเองได้"), `ข้อความ: ${$("parseMsg").textContent}`);
  pick(w, d, "herbAdd", "ขิง"); pick(w, d, "drugAdd", "warfarin"); await submit(d);
  const ex = [...d.querySelectorAll("#p1 button")].find((b) => b.textContent.includes("ให้ AI เรียบเรียง"));
  ok(!!ex && ex.textContent.startsWith("ตัวเลือก"), "ปุ่มเรียบเรียงเป็น 'ตัวเลือก' (รอง)");
  ex.click(); await waitFor(() => $("explainBox").textContent.includes("ใช้ข้อความจากธงโดยตรง"));
  ok($("explainBox").textContent.includes("ใช้ข้อความจากธงโดยตรง ไม่ได้ผ่าน AI"), "ไม่มี key -> ใช้ข้อความจากธง ติดป้ายที่มา");

  console.log("== 9) R3 ภาระความเสี่ยงรวม + โรค/สภาวะ ==");
  ({ w, d, $ } = await load());
  pick(w, d, "herbAdd", "รางจืด"); pick(w, d, "herbAdd", "มะแว้งเครือ"); pick(w, d, "drugAdd", "metformin"); pick(w, d, "condAdd", "เบาหวาน"); $("age").value = "58"; await submit(d);
  ok([...$("p1").querySelectorAll(".flag .sev")].some((s) => s.textContent.includes("ภาระความเสี่ยงรวม")), "แสดงการ์ด 'ภาระความเสี่ยงรวม'");
  ok(d.querySelectorAll("#condSel [data-v]").length === 1 && $("p2").textContent.includes("เบาหวาน") || /โรค\/สภาวะ: .*เบาหวาน/.test($("p2").textContent), "โรคที่เลือกถูกส่งและแสดงในใบสรุป");

  console.log("== 10) ตั้งครรภ์: ใช่ / ไม่ใช่ / ไม่ระบุ ==");
  for (const [val, expectFlag, expectUnchecked] of [["yes", true, false], ["no", false, false], ["", false, true]]) {
    ({ w, d, $ } = await load());
    pick(w, d, "herbAdd", "ขิง"); $("age").value = "30"; $("pregnant").value = val; await submit(d);
    const t = $("p1").textContent;
    ok((/ไม่แนะนำให้ใช้ขิงบรรเทาคลื่นไส้อาเจียนในสตรีมีครรภ์/.test(t) === expectFlag) && (/ไม่ได้ตรวจเงื่อนไข \(ไม่ได้กรอก\): การตั้งครรภ์/.test(t) === expectUnchecked),
       `ตั้งครรภ์="${val || "ไม่ระบุ"}" -> ธง=${expectFlag} ไม่ได้ตรวจ=${expectUnchecked}`);
  }

  console.log(fails ? `\nสรุป: ล้มเหลว ${fails} ข้อ` : "\nสรุป: ผ่านทุกข้อ");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(2); });
