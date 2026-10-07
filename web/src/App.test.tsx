import { render, screen } from "@testing-library/preact";
import { App } from "./App";

test("แสดงหัวข้อ HerbGuard", () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("HerbGuard");
});
