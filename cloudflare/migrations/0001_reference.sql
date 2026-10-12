-- ข้อมูลอ้างอิงที่ engine ใช้ตัดสิน (ย้ายจาก data/*.json) ผู้เชี่ยวชาญแก้เป็นแถวได้โดยไม่แตะโค้ด
-- กติกา: ห้ามตั้ง verified เป็น 1 โดยไม่ระบุ verified_by (CLAUDE.md กฎข้อ 2) ฐานข้อมูลบังคับให้ด้วย CHECK
-- ทุกครั้งที่แก้ตารางใด ๆ trigger จะเปลี่ยน data_version เพื่อให้ Worker โหลดข้อมูลใหม่
-- คอลัมน์ extra = ฟิลด์ที่ไม่มีคอลัมน์เฉพาะ (JSON), null_keys = รายชื่อฟิลด์ที่เป็น null จริงในข้อมูลต้นทาง (แยกจาก "ไม่มีฟิลด์")

CREATE TABLE ref_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE herbs (
  id          TEXT PRIMARY KEY,
  pos         INTEGER NOT NULL,          -- ลำดับเดิมใน herbs.json
  no          INTEGER,
  name_th     TEXT NOT NULL,
  parts       TEXT NOT NULL,             -- JSON array
  source      TEXT NOT NULL,             -- JSON object (doc, pdf_pages, printed_pages)
  verified    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  verified_by TEXT,
  extra       TEXT,
  CHECK (verified = 0 OR verified_by IS NOT NULL)
);

-- กฎของสมุนไพร: kind = ชนิดรายการตามคีย์ใน herbs.json (contraindications, age_limits, drug_cautions, condition_cautions, duration_limits, notes)
CREATE TABLE herb_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  herb_id        TEXT NOT NULL REFERENCES herbs(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('contraindications','age_limits','drug_cautions','condition_cautions','duration_limits','notes')),
  pos            INTEGER NOT NULL,
  level          TEXT CHECK (level IS NULL OR level IN ('avoid','caution','info')),
  text           TEXT,
  condition      TEXT,
  drug_class     TEXT,
  mechanism_tag  TEXT,
  evidence_tier  TEXT CHECK (evidence_tier IS NULL OR evidence_tier IN ('A','B','C')),
  evidence_quote TEXT,
  source_page    INTEGER,
  pdf_page       INTEGER,
  verified       INTEGER CHECK (verified IS NULL OR verified IN (0, 1)),
  verified_by    TEXT,
  min_age_years  INTEGER,
  max_days       INTEGER,
  grp            TEXT,
  team_note      TEXT,
  extra          TEXT,
  null_keys      TEXT,
  CHECK (verified IS NULL OR verified = 0 OR verified_by IS NOT NULL)
);
CREATE INDEX idx_herb_rules_herb ON herb_rules(herb_id, kind, pos);

CREATE TABLE formulas (
  id          TEXT PRIMARY KEY,
  pos         INTEGER NOT NULL,
  name_th     TEXT NOT NULL,
  verified    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  verified_by TEXT,
  body        TEXT NOT NULL,             -- JSON: ส่วนที่ไม่ใช่กฎรายแถว (กลุ่มตัวยา สัดส่วน ตัวอย่าง ข้อขัดแย้งของเอกสาร ฯลฯ)
  CHECK (verified = 0 OR verified_by IS NOT NULL)
);

CREATE TABLE formula_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  formula_id     TEXT NOT NULL REFERENCES formulas(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('contraindications','condition_cautions','notes')),
  pos            INTEGER NOT NULL,
  rule_key       TEXT,                   -- id ของกฎในเอกสารต้นทาง (เช่น bt_ci_pregnancy_hot)
  level          TEXT CHECK (level IS NULL OR level IN ('avoid','caution','info')),
  text           TEXT,
  condition      TEXT,
  drug_class     TEXT,
  mechanism_tag  TEXT,
  evidence_tier  TEXT CHECK (evidence_tier IS NULL OR evidence_tier IN ('A','B','C')),
  evidence_quote TEXT,
  source_page    INTEGER,
  pdf_page       INTEGER,
  verified       INTEGER CHECK (verified IS NULL OR verified IN (0, 1)),
  verified_by    TEXT,
  extra          TEXT,
  null_keys      TEXT,
  CHECK (verified IS NULL OR verified = 0 OR verified_by IS NOT NULL)
);
CREATE INDEX idx_formula_rules_formula ON formula_rules(formula_id, kind, pos);

CREATE TABLE drug_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pos         INTEGER NOT NULL,
  names       TEXT NOT NULL,             -- JSON array ชื่อยา/ชื่อพ้อง
  classes     TEXT NOT NULL,             -- JSON array กลุ่มยา
  verified    INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  verified_by TEXT,
  extra       TEXT,
  CHECK (verified = 0 OR verified_by IS NOT NULL)
);

CREATE TABLE conditions (
  id       TEXT PRIMARY KEY,
  pos      INTEGER NOT NULL,
  label_th TEXT NOT NULL
);

CREATE TABLE mechanism_tags (
  id       TEXT PRIMARY KEY,
  pos      INTEGER NOT NULL,
  label_th TEXT NOT NULL
);

-- พารามิเตอร์ที่ทีมตั้งเอง (กฎข้อ 7): wrapped = 1 เมื่อรูปเดิมเป็น {"value":..., "note":...}
CREATE TABLE config (
  key     TEXT PRIMARY KEY,
  pos     INTEGER NOT NULL,
  value   TEXT NOT NULL,                 -- JSON
  note    TEXT,
  wrapped INTEGER NOT NULL DEFAULT 1 CHECK (wrapped IN (0, 1)),
  CHECK (wrapped = 0 OR note IS NOT NULL)
);

-- เอกสารอ้างอิง/ฟิลด์ระดับบนสุดของชุดข้อมูล (note, source, _status ฯลฯ) และชุดที่ engine ยังไม่ใช้ตัดสิน
CREATE TABLE ref_docs (
  name TEXT PRIMARY KEY,
  doc  TEXT NOT NULL                     -- JSON
);

-- เปลี่ยน data_version ทุกครั้งที่แก้ข้อมูล เพื่อให้ Worker โหลดใหม่ (ตารางละ 3 trigger)
CREATE TRIGGER bump_herbs_i AFTER INSERT ON herbs BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_herbs_u AFTER UPDATE ON herbs BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_herbs_d AFTER DELETE ON herbs BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_herb_rules_i AFTER INSERT ON herb_rules BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_herb_rules_u AFTER UPDATE ON herb_rules BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_herb_rules_d AFTER DELETE ON herb_rules BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_formulas_i AFTER INSERT ON formulas BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_formulas_u AFTER UPDATE ON formulas BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_formulas_d AFTER DELETE ON formulas BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_formula_rules_i AFTER INSERT ON formula_rules BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_formula_rules_u AFTER UPDATE ON formula_rules BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_formula_rules_d AFTER DELETE ON formula_rules BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_drug_entries_i AFTER INSERT ON drug_entries BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_drug_entries_u AFTER UPDATE ON drug_entries BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_drug_entries_d AFTER DELETE ON drug_entries BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_conditions_i AFTER INSERT ON conditions BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_conditions_u AFTER UPDATE ON conditions BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_conditions_d AFTER DELETE ON conditions BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_mechanism_tags_i AFTER INSERT ON mechanism_tags BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_mechanism_tags_u AFTER UPDATE ON mechanism_tags BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_mechanism_tags_d AFTER DELETE ON mechanism_tags BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_config_i AFTER INSERT ON config BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_config_u AFTER UPDATE ON config BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_config_d AFTER DELETE ON config BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_ref_docs_i AFTER INSERT ON ref_docs BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_ref_docs_u AFTER UPDATE ON ref_docs BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;
CREATE TRIGGER bump_ref_docs_d AFTER DELETE ON ref_docs BEGIN UPDATE ref_meta SET value = hex(randomblob(8)) WHERE key = 'data_version'; END;

INSERT INTO ref_meta(key, value) VALUES ('data_version', 'empty');
