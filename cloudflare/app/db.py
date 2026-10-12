"""ตัวกลางเข้าถึงฐานข้อมูล: อินเทอร์เฟซแบบอะซิงก์เล็ก ๆ ที่ตรงกับ D1 (prepare/bind/all/first/run/batch)
Worker ใช้ตัวห่อ D1 จริง (src/worker.py) ส่วนเครื่องทดสอบ/เซิร์ฟเวอร์ท้องถิ่นใช้ SqliteDb ด้านล่าง (D1 คือ SQLite จึงรันไฟล์ migrations เดียวกันได้)
"""
import sqlite3


class SqliteDb:
    def __init__(self, path: str = ":memory:"):
        self.conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def executescript(self, sql: str) -> None:
        self.conn.executescript(sql)

    async def all(self, sql: str, params: tuple = ()) -> list[dict]:
        return [dict(r) for r in self.conn.execute(sql, params).fetchall()]

    async def first(self, sql: str, params: tuple = ()):
        r = self.conn.execute(sql, params).fetchone()
        return dict(r) if r else None

    async def run(self, sql: str, params: tuple = ()) -> int:
        """คืนจำนวนแถวที่เปลี่ยน"""
        return self.conn.execute(sql, params).rowcount

    async def batch(self, stmts: list[tuple[str, tuple]]) -> None:
        """รันทั้งชุดเป็นธุรกรรมเดียว (D1 batch เป็น atomic เช่นกัน)"""
        self.conn.execute("BEGIN")
        try:
            for sql, params in stmts:
                self.conn.execute(sql, params)
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise
