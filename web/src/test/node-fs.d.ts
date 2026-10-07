// ponytail: ชนิดขั้นต่ำของ node:fs สำหรับเทสต์ที่อ่านไฟล์นอกโฟลเดอร์ web/ (vite ไม่ให้ import ?raw นอก root) ไม่เพิ่ม @types/node
// path สัมพัทธ์กับโฟลเดอร์ web/ (npm test รันจากที่นั่น) ติดตั้ง @types/node เมื่อเทสต์ต้องใช้ API ของ node มากกว่านี้
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function existsSync(path: string): boolean;
}
