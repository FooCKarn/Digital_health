import { render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { LangToggle } from "./components/LangToggle";
import { getLang, setLang, t } from "./i18n";
import { SEVERITY_TEXT } from "./components/SeverityBadge";
import { thaiDate } from "./model/dates";

afterEach(() => setLang("th"));

test("ปุ่มเดียวสลับ ไทย ⇄ อังกฤษ และข้อความตามภาษาที่เลือก", async () => {
  render(<LangToggle />);
  expect(getLang()).toBe("th");
  expect(t("ไทย", "English")).toBe("ไทย");
  await userEvent.click(screen.getByRole("button", { name: /EN/ }));
  expect(getLang()).toBe("en");
  expect(document.documentElement.lang).toBe("en");
  expect(t("ไทย", "English")).toBe("English");
  expect(SEVERITY_TEXT.avoid).toBe("Avoid");
  expect(thaiDate("2026-10-14")).toBe("14 October 2026");
  await userEvent.click(screen.getByRole("button", { name: /ไทย/ }));
  expect(getLang()).toBe("th");
  expect(SEVERITY_TEXT.avoid).toBe("ควรหลีกเลี่ยง");
  expect(thaiDate("2026-10-14")).toBe("14 ตุลาคม 2569");
});

test("จำภาษาที่เลือกไว้ใน hg_lang_v1", () => {
  setLang("en");
  expect(window.localStorage.getItem("hg_lang_v1")).toBe("en");
});
