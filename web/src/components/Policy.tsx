import type { ComponentChildren } from "preact";
import { getLang, t } from "../i18n";
import { CHAT_KEY } from "../chat/chatStore";
import { DIARY_KEY } from "../model/diary";
import { REMINDER_KEY } from "../model/reminder";
import { WELCOME_KEY } from "./Welcome";
import { STORAGE_KEY } from "../model/tracker";

export const POLICY_VERSION = "12 ตุลาคม 2569 (ร่าง)";
const versionLabel = () => t(POLICY_VERSION, "12 October 2026 (draft)");
// ข้อความที่มีแท็กเน้นข้างใน: เลือกทั้งก้อนตามภาษา
const L = (th: ComponentChildren, en: ComponentChildren) => (getLang() === "en" ? en : th);

/** เปิดส่วนนโยบายแล้วเลื่อนไป (ใช้จากลิงก์ในหน้าอื่น) */
export function openPolicy(): void {
  const d = document.getElementById("policy") as HTMLDetailsElement | null;
  if (d) { d.open = true; d.scrollIntoView?.(); }
}

/**
 * เงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว: ทุกข้อเขียนจากสิ่งที่โค้ดทำจริง
 * (คีย์ที่เก็บอ้างค่าคงที่จากโค้ด ส่วนฟิลด์ที่ส่งตรวจด้วยเทสต์ใน Policy.test.tsx กันข้อความเพี้ยนจากพฤติกรรม)
 * เป็นร่าง ยังไม่ผ่านที่ปรึกษากฎหมาย/ผู้เชี่ยวชาญ PDPA
 */
export function Policy() {
  return (
    <details id="policy" class="card policy">
      <summary><strong>{t("เงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว", "Terms of use and privacy policy")}</strong></summary>
      <p class="meta">{t(`เวอร์ชัน ${POLICY_VERSION} · ยังไม่มีที่ปรึกษากฎหมายหรือผู้เชี่ยวชาญเรื่องข้อมูลส่วนบุคคลตรวจข้อความนี้`, `Version ${versionLabel()} · no lawyer or personal-data expert has reviewed this text yet`)}</p>

      <h3>{t("1. แอปนี้คืออะไร", "1. What this app is")}</h3>
      <ul>
        <li>{t("ใบพลู เป็นต้นแบบที่ช่วยดูคำเตือนเวลาใช้สมุนไพรไทยร่วมกับยา ไม่ใช่การวินิจฉัย ไม่ใช่การสั่งยา และไม่ใช่คำแนะนำทางการแพทย์", "Baiplu is a prototype that helps you see warnings when Thai herbs are used together with medicines. It is not a diagnosis, not a prescription and not medical advice.")}</li>
        <li>{L(<>ข้อมูลมาจากหนังสือ TTM first เท่าที่ทีมดึงมาแล้ว ยังไม่ครบ 50 ชนิดในเล่ม (ดูจำนวนจริงที่ป้ายในหน้า ช่วงนี้) ส่วนข้อห้ามของ “ตำรับยาบำรุงโลหิต” มาจากแนวทางการตั้งตำรับยาบำรุงโลหิตของสถาบันการแพทย์แผนไทย และ <strong>ทุกรายการยังเป็นร่างที่ผู้เชี่ยวชาญยังไม่ได้ตรวจ</strong></>, <>The data comes from the TTM first book, as far as the team has extracted so far. It does not yet cover all 50 herbs in the book (see the actual count on the label in the This period tab). The contraindications for the blood-tonic formula (“ตำรับยาบำรุงโลหิต”) come from the Institute of Thai Traditional Medicine's guidelines for that formula, and <strong>every entry is still a draft that experts have not yet reviewed</strong>.</>)}</li>
        <li>{t("ถ้าไม่พบคำเตือน แปลว่าไม่พบในฐานข้อมูลนี้เท่านั้น ไม่ได้แปลว่าใช้ได้อย่างเหมาะสม ควรถามเภสัชกรหรือแพทย์ก่อนใช้", "If no warning is found, it only means none was found in this database. It does not mean the combination is suitable to use. Ask a pharmacist or doctor before use.")}</li>
        <li>{t("ถ้ามีอาการรุนแรงหรือฉุกเฉิน โทร 1669 หรือไปโรงพยาบาลทันที อย่ารอผลจากแอปนี้", "If you have severe or emergency symptoms, call 1669 (Thailand) or go to a hospital right away. Do not wait for a result from this app.")}</li>
      </ul>

      <h3>{t("2. เงื่อนไขการใช้งาน", "2. Terms of use")}</h3>
      <ul>
        <li>{t("ใช้เป็นข้อมูลประกอบตอนคุยกับเภสัชกรหรือแพทย์ ไม่ใช้แทนคำแนะนำของผู้ประกอบวิชาชีพ คุณเป็นคนตัดสินใจเองว่าจะใช้ยาหรือสมุนไพรอย่างไร", "Use it as supporting information when talking to a pharmacist or doctor, not in place of a professional's advice. You decide for yourself how to use medicines or herbs.")}</li>
        <li>{t("ทีมไม่รับประกันว่าข้อมูลครบ ถูกต้อง หรือทันสมัย ผลตรวจอาจผิดพลาดได้", "The team does not guarantee that the data is complete, correct or up to date. Results may be wrong.")}</li>
        <li>{t("ตอนนี้ยังเป็นต้นแบบ ขอให้กรอกข้อมูลสมมติ ถ้าคุณเลือกกรอกข้อมูลจริงของตัวเอง ข้อมูลจะถูกจัดการตามข้อ 3 และคุณรับผิดชอบการตัดสินใจนั้นเอง อย่ากรอกข้อมูลของคนอื่นโดยไม่ได้รับอนุญาต", "This is still a prototype, so please enter made-up data. If you choose to enter your own real data, it is handled as described in section 3 and you are responsible for that decision. Do not enter other people's data without permission.")}</li>
        <li>{t("ทีมอาจแก้หรือหยุดให้บริการต้นแบบนี้เมื่อไรก็ได้", "The team may change or stop this prototype at any time.")}</li>
      </ul>

      <h3>{t("3. ข้อมูลอะไร เก็บที่ไหน ส่งไปไหน", "3. What data, where it is stored, where it is sent")}</h3>
      <div class="tablewrap">
        <table>
          <caption class="sr-only">{t("ตารางข้อมูลที่เก็บและที่ส่ง", "Table of data stored and sent")}</caption>
          <thead><tr><th scope="col">{t("ข้อมูล", "Data")}</th><th scope="col">{t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}</th><th scope="col">{t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row">{t("สมุนไพร/ยาที่ใช้ วันที่เริ่ม โปรไฟล์ (อายุ ตั้งครรภ์ ให้นมบุตร โรค)", "Herbs/medicines in use, start dates, profile (age, pregnancy, breastfeeding, conditions)")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t(`ที่เก็บข้อมูลของเบราว์เซอร์นี้ ชื่อ ${STORAGE_KEY} อยู่จนกว่าคุณจะลบ`, `In this browser's storage, named ${STORAGE_KEY}. Kept until you delete it.`)}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{t("ตอนตรวจ จะส่งรหัสสมุนไพรกับจำนวนวันที่ใช้ ชื่อยา (รวมชื่อที่คุณพิมพ์เอง) อายุ ตั้งครรภ์ ให้นมบุตร และโรค ไปคำนวณที่เซิร์ฟเวอร์ (/api/analyze) ไม่ส่งวันที่เริ่มจริง โค้ดฝั่งเซิร์ฟเวอร์ไม่บันทึกค่าเหล่านี้ลงฐานข้อมูลหรือไฟล์", "When checking, herb codes with the number of days in use, medicine names (including names you typed yourself), age, pregnancy, breastfeeding and conditions are sent to the server (/api/analyze) to be worked out. The real start dates are not sent. The server code does not save these values to a database or a file.")}</td>
            </tr>
            <tr>
              <th scope="row">{t("บันทึกสุขภาพ (ความรู้สึก อาการ ความดัน น้ำตาล น้ำหนัก) และการกด “ใช้แล้ววันนี้”", "Health diary (mood, symptoms, blood pressure, glucose, weight) and “Taken today” marks")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t(`ที่เก็บข้อมูลของเบราว์เซอร์นี้ ชื่อ ${DIARY_KEY} อยู่จนกว่าคุณจะลบ`, `In this browser's storage, named ${DIARY_KEY}. Kept until you delete it.`)}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{L(<><strong>ไม่ส่งไปที่ใดเลย</strong> ไม่ส่งไปตรวจ ไม่ส่งให้แชตหรือ AI (ปุ่มพิมพ์และส่งออกไฟล์ทำงานในเครื่องคุณ) ยกเว้นคุณสมัครบัญชีและเปิดซิงก์เอง ดูแถว “บัญชีและข้อมูลที่ซิงก์” ด้านล่าง</>, <><strong>Not sent anywhere.</strong> It is not sent for checking and not given to the chat or the AI (the print and export buttons work on your device), unless you sign up for an account and turn on sync yourself. See the “Account and synced data” row below.</>)}</td>
            </tr>
            <tr>
              <th scope="row">{t("ประวัติแชต", "Chat history")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t(`ที่เก็บชั่วคราวของแท็บนี้ ชื่อ ${CHAT_KEY} หายเมื่อปิดแท็บ`, `In this tab's temporary storage, named ${CHAT_KEY}. Gone when you close the tab.`)}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{t("ส่งเฉพาะคำถามล่าสุดพร้อมรายการที่ใช้อยู่ (ชุดเดียวกับตอนตรวจ) ไปที่ /api/ask ไม่ส่งประวัติแชต ถ้าทีมเปิดโหมด AI ของแชต คำถามและข้อความที่ค้นได้จะถูกส่งต่อให้ผู้ให้บริการ AI", "Only the latest question is sent, together with your items in use (the same set as when checking), to /api/ask. The chat history is not sent. If the team turns on the chat's AI mode, the question and the text found are passed on to the AI provider.")}</td>
            </tr>
            <tr>
              <th scope="row">{t("ข้อความที่พิมพ์ในช่อง AI แยกรายการ และปุ่ม AI อธิบายผล", "Text typed in the AI item-picker box, and the AI explain button")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t("ไม่เก็บถาวร", "Not stored permanently")}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{t("ช่องแยกรายการส่งข้อความที่คุณพิมพ์ไปที่ /api/parse แล้วส่งต่อให้ผู้ให้บริการ AI ภายนอก (ค่าเริ่มต้นของโค้ดคือ Google Gemini) ถ้าเซิร์ฟเวอร์ตั้งค่าไว้ ส่วนปุ่มอธิบายผลส่งข้อมูลชุดเดียวกับตอนตรวจไปที่ /api/explain เซิร์ฟเวอร์คำนวณคำเตือนเองก่อน แล้วส่งข้อความคำเตือนกับรายการที่เกี่ยวข้องให้ AI เรียบเรียง ถ้า AI ใช้ไม่ได้หรือผลไม่ผ่านตัวตรวจ จะใช้ข้อความสำเร็จรูปแทน", "The item-picker box sends what you type to /api/parse and then on to an outside AI provider (the code's default is Google Gemini) if the server is set up that way. The explain button sends the same data as when checking to /api/explain. The server works out the warnings itself first, then gives the warning text and the related items to the AI to reword. If the AI is unavailable or its result does not pass the checker, ready-made text is used instead.")}</td>
            </tr>
            <tr>
              <th scope="row">{t("ธงว่าดูหน้าต้อนรับและวิธีใช้แล้ว", "Flag that you have seen the welcome page and guide")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t(`ที่เก็บข้อมูลของเบราว์เซอร์นี้ ชื่อ ${WELCOME_KEY} ค่า 1 อย่างเดียว อยู่จนกว่าคุณจะลบข้อมูลเบราว์เซอร์`, `In this browser's storage, named ${WELCOME_KEY}, with the single value 1. Kept until you clear your browser data.`)}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{L(<strong>ไม่ส่งไปที่ใดเลย</strong>, <strong>Not sent anywhere.</strong>)}</td>
            </tr>
            <tr>
              <th scope="row">{t("เวลาที่ตั้งเตือนให้บันทึกการใช้", "Reminder time for logging doses")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t(`ที่เก็บข้อมูลของเบราว์เซอร์นี้ ชื่อ ${REMINDER_KEY} อยู่จนกว่าคุณจะปิดเตือนหรือลบข้อมูล`, `In this browser's storage, named ${REMINDER_KEY}. Kept until you turn the reminder off or delete your data.`)}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{L(<><strong>ไม่ส่งไปที่ใดเลย</strong> เตือนได้เฉพาะตอนเปิดหน้านี้ค้างไว้ในเบราว์เซอร์ ข้อความแจ้งเตือนไม่แสดงชื่อยา</>, <><strong>Not sent anywhere.</strong> Reminders work only while this page stays open in the browser. The notification text does not show medicine names.</>)}</td>
            </tr>
            <tr>
              <th scope="row">{t("แชตในหน้า “ผู้ช่วย” และปุ่ม “ให้ AI เรียบเรียงสรุป”", "The chat in the “Assistant” tab and the “Have the AI reword this summary” button")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t("ไม่เก็บถาวร", "Not stored permanently")}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{t("ส่งเมื่อคุณกดส่งเท่านั้น ข้อความที่พิมพ์ในแชตกับชื่อรายการที่ใช้อยู่ไปที่ /api/assistant เพื่อเลือกเครื่องมือ (เช่น สรุปวันนี้ บันทึกว่าใช้ เพิ่มรายการ ตั้งเตือน) แล้วส่งต่อให้ผู้ให้บริการ AI ภายนอกตามที่เซิร์ฟเวอร์ตั้งไว้ ถ้าเป็นคำถามจะส่งไป /api/ask ตามแถวแชตด้านบน ปุ่มเรียบเรียงสรุปส่งตัวเลขกับชื่อรายการที่ยังไม่กดไปที่ /api/brief ไม่ส่งข้อมูลบันทึกสุขภาพ (ความรู้สึก อาการ ค่าที่วัด) AI ตอบกลับเป็นแค่ชื่อเครื่องมือกับรายการของคุณ หน้าเว็บเป็นผู้ลงมือ การกระทำที่แก้ข้อมูลมีปุ่มเลิกทำ การเพิ่มรายการต้องกดยืนยัน บทสนทนาเก็บในหน่วยความจำของหน้านี้ หายเมื่อรีเฟรช", "Sent only when you press send. The text you type in the chat and the names of your items in use go to /api/assistant to choose a tool (for example summarize today, log a dose, add an item, set a reminder), and are then passed on to an outside AI provider as the server is configured. A question is sent to /api/ask as in the chat row above. The reword-summary button sends numbers and the names of items not yet marked to /api/brief. Health diary data (mood, symptoms, measured values) is not sent. The AI replies with only a tool name and your items; the web page does the acting. Actions that change data have an Undo button, and adding items needs your confirmation. The conversation is kept in this page's memory and disappears on refresh.")}</td>
            </tr>
            <tr>
              <th scope="row">{t("บัญชีและข้อมูลที่ซิงก์ (ไม่บังคับ: มีเมื่อคุณสมัครเองเท่านั้น)", "Account and synced data (optional: only if you sign up yourself)")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t("ฐานข้อมูล D1 ของ Cloudflare (ผู้ให้บริการโฮสต์) เก็บ ชื่อผู้ใช้ที่คุณตั้ง แฮชของรหัสผ่าน (ไม่เก็บรหัสผ่านจริง) เวอร์ชันนโยบายกับเวลาที่คุณกดยอมรับ เซสชันการเข้าสู่ระบบ (แฮชของโทเค็น หมดอายุ 30 วัน) และเอกสารที่ซิงก์ ได้แก่ รายการที่ใช้และโปรไฟล์ บันทึกสุขภาพ การกดว่าใช้ ขนาดที่จดเอง และเวลาเตือน อยู่จนกว่าคุณลบบัญชี", "Cloudflare's D1 database (the hosting provider) stores the username you chose, a hash of your password (the real password is not stored), the policy version and the time you accepted it, login sessions (a hash of the token, expiring after 30 days), and the synced documents: items in use and profile, health diary, dose marks, your own dose notes and the reminder time. It is kept until you delete the account.")}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{L(<><strong>ส่งขึ้นเซิร์ฟเวอร์เมื่อคุณเข้าสู่ระบบ</strong> (ที่เก็บในเครื่องยังเป็นฉบับหลัก) ใช้คุกกี้ hg_session แบบ HttpOnly เฉพาะตอนเข้าสู่ระบบ ข้อมูลบันทึกสุขภาพที่ซิงก์ไม่ถูกส่งต่อให้ AI ไม่ส่งอีเมลหรือเบอร์โทรเพราะเราไม่เก็บ ใช้ข้อมูลสมมติเท่านั้น (ดูข้อ 5)</>, <><strong>Sent to the server when you log in</strong> (the copy on your device is still the main one). An HttpOnly cookie named hg_session is used only while logged in. Synced health diary data is not passed on to the AI. No email or phone number is sent because we do not store them. Use made-up data only (see section 5).</>)}</td>
            </tr>
            <tr>
              <th scope="row">{t("แบบประเมินการทดลอง (ถ้าคุณกดส่ง)", "Trial feedback form (if you press send)")}</th>
              <td data-label={t("เก็บที่ไหน / นานแค่ไหน", "Where it is stored / for how long")}>{t("บันทึกเป็นบรรทัดข้อความในบันทึกการทำงานของเซิร์ฟเวอร์ ไม่ถาวร ทีมไม่มีฐานข้อมูลเก็บ", "Written as a line of text in the server's activity log. It is not permanent, and the team has no database for it.")}</td>
              <td data-label={t("ส่งออกจากเครื่องคุณหรือไม่", "Does it leave your device?")}>{L(<>ส่งรหัสสุ่มของเบราว์เซอร์ บทบาท ชื่อเคส ความเห็นต่อแต่ละคำเตือน ความเห็นอิสระ (ไม่เกิน 500 ตัวอักษร) และเวลาที่ใช้ <strong>อย่าพิมพ์ข้อมูลส่วนตัวในช่องความเห็น</strong></>, <>Sends a random browser code, your role, the case name, your view on each warning, free-text comments (up to 500 characters) and the time spent. <strong>Do not type personal information in the comment box.</strong></>)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>{t("4. สิ่งที่แอปนี้ไม่ทำ", "4. What this app does not do")}</h3>
      <ul>
        <li>{t("ไม่บังคับให้มีบัญชี ใช้งานได้เต็มโดยไม่ล็อกอิน ถ้าไม่สมัคร ข้อมูลอยู่ในเครื่องนี้เท่านั้นและทีมกู้ข้อมูลที่หายให้ไม่ได้ ถ้าสมัครบัญชี เราไม่เก็บอีเมลหรือเบอร์โทร จึงกู้รหัสผ่านที่ลืมให้ไม่ได้ และไม่มีทางยืนยันว่าใครเป็นเจ้าของบัญชี", "An account is not required. Everything works without logging in. If you do not sign up, your data stays only on this device and the team cannot recover lost data. If you do sign up, we do not store an email or phone number, so we cannot recover a forgotten password and have no way to confirm who owns an account.")}</li>
        <li>{t("ไม่ใช้คุกกี้ติดตาม ไม่มีตัวนับผู้ใช้ ไม่มีโฆษณา และไม่โหลดสคริปต์หรือฟอนต์จากเว็บอื่น (ฟอนต์อยู่ในเว็บเอง) คุกกี้ที่มีอย่างเดียวคือ hg_session ตอนเข้าสู่ระบบ", "No tracking cookies, no visitor counter, no ads, and no scripts or fonts loaded from other sites (the fonts are served from this site). The only cookie is hg_session, used while logged in.")}</li>
        <li>{t("ไม่ขายหรือแบ่งข้อมูลให้ใคร", "It does not sell or share data with anyone.")}</li>
        <li>{t("AI ไม่ได้ตัดสินว่ามีคำเตือนหรือไม่ ตัดสินด้วยกฎที่เขียนเป็นโค้ด AI ทำแค่แปลงข้อความที่คุณพิมพ์ เรียบเรียงคำอธิบายจากผลตรวจ ตอบคำถามจากข้อมูลที่ค้นได้ในฐานข้อมูลของเรา เรียบเรียงสรุปวันนี้จากตัวเลขที่เครื่องคุณคำนวณ และเลือกเครื่องมือของเว็บให้ข้อความที่คุณพิมพ์ (หน้าเว็บเป็นผู้ลงมือ เลิกทำได้)", "The AI does not decide whether there is a warning. Rules written in code decide that. The AI only converts the text you type, rewords explanations from the result, answers questions from the data found in our database, rewords today's summary from numbers your device calculated, and picks a tool of the website for what you type (the web page does the acting, and you can undo).")}</li>
      </ul>

      <h3>{t("5. สิ่งที่ทีมยังไม่รู้หรือคุมไม่ได้", "5. What the team does not yet know or cannot control")}</h3>
      <ul>
        <li>{t("ผู้ให้บริการโฮสต์เว็บนี้เห็นข้อมูลการเชื่อมต่อตามปกติ เช่น ที่อยู่ IP เวลา และหน้าที่เรียก เก็บในบันทึกของเขา ทีมคุมระยะเวลาเก็บไม่ได้", "The host of this website sees normal connection data such as IP address, time and pages requested, and keeps it in its own logs. The team cannot control how long it is kept.")}</li>
        <li>{t("ทีมยังไม่ได้ตรวจเงื่อนไขการเก็บและการนำข้อมูลไปใช้ของผู้ให้บริการ AI (รวมแพ็กเกจฟรี) อย่าพิมพ์ข้อมูลที่ระบุตัวคุณได้ลงในช่อง AI หรือแชต", "The team has not yet reviewed the AI provider's terms on storing and using data (including the free tier). Do not type anything that identifies you into the AI boxes or the chat.")}</li>
        <li>{t("ทีมยังไม่ได้ให้ที่ปรึกษากฎหมายดูว่าแอปที่เก็บข้อมูลในเครื่องผู้ใช้อย่างเดียวต้องทำอะไรตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA) บ้าง ข้อมูลสุขภาพเป็นข้อมูลอ่อนไหวตามกฎหมายนี้ ทีมจึงให้ติ๊กยินยอมแยกก่อนบันทึกค่าสุขภาพ", "The team has not yet asked a lawyer what an app that stores data only on the user's device must do under Thailand's Personal Data Protection Act (PDPA). Health data is sensitive data under that law, so the team asks for a separate tick of consent before health readings are saved.")}</li>
        <li>{t("ข้อมูลที่ซิงก์ในคลาวด์เป็นข้อมูลสุขภาพซึ่งอ่อนไหวตามกฎหมาย PDPA ส่งผ่าน HTTPS และเก็บในฐานข้อมูลของ Cloudflare แต่ยังไม่ได้เข้ารหัสรายฟิลด์ ผู้ที่เข้าถึงฐานข้อมูลของทีมอ่านได้ ที่ตั้งของเซิร์ฟเวอร์เลือกเองไม่ได้ (อาจอยู่นอกประเทศไทย) ต้นแบบนี้จึงห้ามใส่ข้อมูลผู้ป่วยจริง ใช้ข้อมูลสมมติเท่านั้น", "Data synced to the cloud is health data, which is sensitive under the PDPA. It is sent over HTTPS and stored in Cloudflare's database, but it is not encrypted field by field, so anyone with access to the team's database can read it. The server location cannot be chosen (it may be outside Thailand). This prototype therefore forbids real patient data and uses made-up data only.")}</li>
        <li>{t("ข้อมูลในเบราว์เซอร์ไม่ได้เข้ารหัสและไม่มีรหัสล็อก คนที่ใช้เครื่องหรือบัญชีเบราว์เซอร์เดียวกันเปิดดูได้ ถ้าใช้เครื่องร่วมกัน ให้ลบข้อมูลก่อนเลิกใช้", "Data in the browser is not encrypted and has no lock. Anyone using the same device or browser account can open it. If you share a device, delete your data before you stop using it.")}</li>
      </ul>

      <h3>{t("6. คุณควบคุมข้อมูลได้อย่างไร", "6. How you control your data")}</h3>
      <ul>
        <li>{t("ดูและสำรอง: หน้า ข้อมูลของฉัน (รายการและโปรไฟล์) กับหน้า บันทึก (บันทึกสุขภาพ) มีปุ่ม ส่งออกไฟล์", "View and back up: the My data tab (items and profile) and the Diary tab (health diary) have an Export file button.")}</li>
        <li>{t("แก้ไข: แก้โปรไฟล์ได้ที่หน้า ข้อมูลของฉัน ส่วนบันทึกสุขภาพ เลือกวันในปฏิทินแล้วบันทึกซ้ำเพื่อแทนที่ได้", "Edit: change your profile in the My data tab. For the health diary, choose the day in the calendar and save again to replace it.")}</li>
        <li>{t("ลบ: ปุ่ม ลบข้อมูลทั้งหมด ในหน้า ข้อมูลของฉัน จะลบรายการ โปรไฟล์ ประวัติแชต และบันทึกสุขภาพในเครื่องนี้ ถ้าจะลบเฉพาะบันทึกสุขภาพ ใช้ปุ่ม ลบบันทึกทั้งหมด ในหน้า บันทึก", "Delete: the Delete all data button in the My data tab deletes the items, profile, chat history and health diary on this device. To delete only the health diary, use the Delete all entries button in the Diary tab.")}</li>
        <li>{t("บัญชี: ในหน้า ข้อมูลของฉัน มีปุ่ม ออกจากระบบ, ลบเฉพาะข้อมูลในคลาวด์ (เก็บบัญชีไว้) และ ลบบัญชี (ลบทุกแถวของคุณในคลาวด์ ต้องใส่รหัสผ่านยืนยัน) ถอนความยินยอมเรื่องบัญชี = ลบบัญชี ข้อมูลในเครื่องนี้ไม่ถูกลบตาม", "Account: the My data tab has Log out, Delete cloud data only (keeps the account) and Delete account (removes all your rows in the cloud; you must enter your password to confirm). Withdrawing consent for the account means deleting the account. Data on this device is not deleted with it.")}</li>
        <li>{t("ถอนความยินยอมเรื่องค่าสุขภาพ: ลบบันทึกทั้งหมดแล้วไม่ติ๊กช่องยินยอมในหน้า บันทึก ถอนได้ง่ายเท่ากับตอนให้", "Withdrawing consent for health readings: delete all entries and leave the consent box unticked in the Diary tab. It is as easy to withdraw as it was to give.")}</li>
        <li>{t("ข้อมูลที่ส่งไปคำนวณหรือส่งให้ผู้ให้บริการ AI ไปแล้ว เราเรียกคืนให้ไม่ได้ แต่ทีมก็ไม่ได้เก็บไว้ในเซิร์ฟเวอร์ของเรา (ยกเว้นแบบประเมินที่คุณกดส่งเอง)", "Data already sent to be worked out or sent to the AI provider cannot be called back by us, but the team does not keep it on our server either (except the feedback form you chose to send).")}</li>
      </ul>

      <h3>{t("7. ติดต่อและการปรับปรุง", "7. Contact and updates")}</h3>
      <ul>
        <li>{t("ช่องทางติดต่อของทีม: ยังไม่ได้ระบุ (รอทีมโครงการกำหนด)", "Team contact: not specified yet (waiting for the project team to decide).")}</li>
        <li>{t(`ปรับปรุงล่าสุด ${POLICY_VERSION} ถ้ามีการเปลี่ยนที่กระทบข้อมูลของคุณ จะแก้ที่หน้านี้และเปลี่ยนเลขเวอร์ชัน`, `Last updated ${versionLabel()}. If a change affects your data, it will be made on this page and the version number will change.`)}</li>
      </ul>
    </details>
  );
}
