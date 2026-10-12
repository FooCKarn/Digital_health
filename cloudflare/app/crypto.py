"""ฟังก์ชันเข้ารหัสที่ฉีดเข้ามาได้: Worker ใช้ WebCrypto (src/worker.py) ส่วนเครื่องทดสอบ/เซิร์ฟเวอร์ท้องถิ่นใช้ PyCrypto
PBKDF2-SHA256 100,000 รอบ (Cloudflare จำกัดสูงสุด 100,000 รอบต่อการเรียก) ค่ารอบเก็บคู่กับแฮชทุกบัญชี จึงปรับเพิ่มภายหลังได้โดยแฮชใหม่ตอนล็อกอิน"""
import hashlib
import hmac
import secrets

PBKDF2_ITER = 100_000


class PyCrypto:
    async def pbkdf2(self, password: str, salt: bytes, iterations: int) -> bytes:
        return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, 32)

    def random_bytes(self, n: int) -> bytes:
        return secrets.token_bytes(n)

    def sha256_hex(self, text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def equal(self, a: str, b: str) -> bool:
        return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
