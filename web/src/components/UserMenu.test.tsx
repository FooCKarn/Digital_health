import { act, fireEvent, render, screen } from "@testing-library/preact";
import { setAccountBadge } from "../accountBadge";
import { UserMenu } from "./UserMenu";

afterEach(() => act(() => setAccountBadge(null)));

test("ยังไม่เข้าสู่ระบบ: ไม่แสดงอะไรที่หัวเว็บ", () => {
  const { container } = render(<UserMenu />);
  expect(container).toBeEmptyDOMElement();
});

test("เข้าสู่ระบบแล้ว: แสดงชื่อผู้ใช้ กดแล้วมีปุ่มออกจากระบบ ออกแล้วเมนูปิด", () => {
  const logout = vi.fn();
  render(<UserMenu />);
  act(() => setAccountBadge({ handle: "somchai", logout }));
  const chip = screen.getByRole("button", { name: "somchai" });
  expect(chip).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "ออกจากระบบ" })).toBeNull();
  fireEvent.click(chip);
  expect(chip).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
  expect(logout).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "ออกจากระบบ" })).toBeNull();
});

test("Esc ปิดเมนูและคืนโฟกัสให้ชื่อผู้ใช้; ออกจากระบบแล้วชื่อหาย", () => {
  render(<UserMenu />);
  act(() => setAccountBadge({ handle: "somchai", logout: () => {} }));
  const chip = screen.getByRole("button", { name: "somchai" });
  fireEvent.click(chip);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("button", { name: "ออกจากระบบ" })).toBeNull();
  expect(chip).toHaveFocus();
  act(() => setAccountBadge(null));
  expect(screen.queryByRole("button", { name: "somchai" })).toBeNull();
});
