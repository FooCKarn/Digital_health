-- บัญชีผู้ใช้และข้อมูลที่ผู้ใช้ "เลือกซิงก์เอง" (ปิดอยู่เป็นค่าเริ่มต้น ถ้าไม่สมัครข้อมูลอยู่ในเครื่องเท่านั้น)
-- ข้อมูลสุขภาพเป็นข้อมูลอ่อนไหวตาม PDPA: ต้องมีความยินยอมที่บันทึกเวอร์ชันนโยบาย, ลบบัญชี = ลบทุกแถวของผู้ใช้ (ON DELETE CASCADE)
-- ต้นแบบนี้ห้ามใช้ข้อมูลผู้ป่วยจริง (CLAUDE.md กฎข้อ 10) จนกว่าที่ปรึกษากฎหมายจะตรวจนโยบาย

CREATE TABLE users (
  id             TEXT PRIMARY KEY,                       -- สุ่ม ไม่ใช้อีเมล/เบอร์โทร
  handle         TEXT NOT NULL UNIQUE COLLATE NOCASE,    -- ชื่อผู้ใช้ 3-32 ตัว a-z 0-9 _ . -
  pw_hash        TEXT NOT NULL,                          -- PBKDF2-SHA256 (hex)
  pw_salt        TEXT NOT NULL,                          -- hex
  pw_iter        INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  consent_policy TEXT NOT NULL,                          -- เวอร์ชันนโยบายที่ผู้ใช้กดยอมรับตอนสมัคร
  consent_at     TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                           -- SHA-256 ของโทเค็นในคุกกี้ (ไม่เก็บโทเค็นจริง)
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_exp ON sessions(expires_at);

-- กันเดารหัสผ่าน: นับครั้งที่ผิดต่อ (ชื่อผู้ใช้ + แฮชของ IP) ล็อกชั่วคราว
CREATE TABLE login_attempts (
  key          TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL,
  first_at     TEXT NOT NULL,
  locked_until TEXT
);

-- เอกสารสถานะของผู้ใช้ (รูปแบบเดียวกับไฟล์ส่งออกของหน้าเว็บ): รายการที่ใช้+โปรไฟล์, บันทึกสุขภาพ+การกดว่าใช้+ขนาดที่จด, เวลาเตือน
CREATE TABLE user_state (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tracker    TEXT,
  diary      TEXT,
  reminder   TEXT,
  version    INTEGER NOT NULL DEFAULT 0,                 -- ใช้กันเขียนทับกันจากหลายเครื่อง (optimistic lock)
  updated_at TEXT NOT NULL
);
