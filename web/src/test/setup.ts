import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/preact";
import { afterEach, beforeEach } from "vitest";

afterEach(() => cleanup());

// ข้ามหน้าต้อนรับในเทสต์ทั่วไป (เทสต์ของ Welcome ลบคีย์นี้เอง) แม้เทสต์เรียก localStorage.clear()
const seed = () => localStorage.setItem("hg_welcome_v1", "1");
const origClear = Storage.prototype.clear;
Storage.prototype.clear = function () { origClear.call(this); if (this === localStorage) seed(); };
beforeEach(seed);
