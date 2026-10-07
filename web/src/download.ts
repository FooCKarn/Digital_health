/** ดาวน์โหลดข้อความเป็นไฟล์ JSON ในเครื่องผู้ใช้ (ไม่ส่งขึ้นเซิร์ฟเวอร์) */
export function downloadJSON(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a); // บางเบราว์เซอร์ (Firefox) ต้องมีลิงก์ในหน้าก่อนคลิก
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000); // ให้เบราว์เซอร์เริ่มดาวน์โหลดก่อนคืนหน่วยความจำ
}
