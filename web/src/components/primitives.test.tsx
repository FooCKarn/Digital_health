import { render, screen } from "@testing-library/preact";
import { SeverityBadge, SEVERITY_TEXT } from "./SeverityBadge";
import { ScopeChip } from "./ScopeChip";
import { Disclaimer } from "./Disclaimer";

const EXPECT = {
  avoid: "ควรหลีกเลี่ยง", caution: "ควรระวัง", info: "ข้อมูลเพิ่มเติม",
  no_flag: "ไม่พบธงเตือนในฐานข้อมูลนี้", no_data: "ยังไม่มีข้อมูลตรวจ",
} as const;

describe("SeverityBadge", () => {
  for (const [kind, text] of Object.entries(EXPECT)) {
    it(`${kind}: ไอคอน svg aria-hidden + ข้อความ + data-kind`, () => {
      const { container } = render(<SeverityBadge kind={kind as keyof typeof EXPECT} />);
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
      expect(container.querySelector(`[data-kind='${kind}']`)).not.toBeNull();
    });
  }
  it("ข้อความตรงตารางและไม่มีคำว่าปลอดภัย", () => {
    expect(SEVERITY_TEXT).toEqual(EXPECT);
    expect(Object.values(SEVERITY_TEXT).join("")).not.toContain("ปลอดภัย");
  });
});

describe("ScopeChip", () => {
  it("ใช้เลขจาก coverage และ herbs_in_book", () => {
    render(<ScopeChip coverage={{ herbs_in_db: 12, herbs_in_book: 50, drug_classes_in_db: 7 }} />);
    expect(screen.getByText("สมุนไพร 12 จาก 50 ชนิด · 7 กลุ่มยา")).toBeInTheDocument();
  });
  it("coverage ต่างกันได้ข้อความต่างกัน (ไม่ฝังเลข)", () => {
    render(<ScopeChip coverage={{ herbs_in_db: 3, herbs_in_book: 60, drug_classes_in_db: 2 }} />);
    expect(screen.getByText("สมุนไพร 3 จาก 60 ชนิด · 2 กลุ่มยา")).toBeInTheDocument();
  });
  it("ไม่มี herbs_in_book ใช้ prop herbsInBook", () => {
    render(<ScopeChip coverage={{ herbs_in_db: 5, drug_classes_in_db: 1 }} herbsInBook={50} />);
    expect(screen.getByText("สมุนไพร 5 จาก 50 ชนิด · 1 กลุ่มยา")).toBeInTheDocument();
  });
  it("ไม่มีทั้งสองอย่าง ไม่เดาเลขหนังสือ", () => {
    const { container } = render(<ScopeChip coverage={{ herbs_in_db: 5, drug_classes_in_db: 1 }} />);
    expect(container.textContent).toBe("สมุนไพร 5 ชนิด · 1 กลุ่มยา");
  });
});

describe("Disclaimer", () => {
  it("แสดงข้อความใน role=note ที่มีป้ายกำกับ", () => {
    render(<Disclaimer text="ไม่ใช่การวินิจฉัย" />);
    const el = screen.getByRole("note");
    expect(el).toHaveTextContent("ไม่ใช่การวินิจฉัย");
  });
});
