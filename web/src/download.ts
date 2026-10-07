/** ดาวน์โหลดข้อความเป็นไฟล์ JSON ในเครื่องผู้ใช้ (ไม่ส่งขึ้นเซิร์ฟเวอร์) */
export function downloadJSON(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0); // ให้เบราว์เซอร์เริ่มดาวน์โหลดก่อนคืนหน่วยความจำ
}
