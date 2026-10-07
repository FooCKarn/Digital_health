import { VITAL_LABEL, type VitalKey } from "../model/diary";

const W = 280, H = 72, PAD = 8;

/** กราฟเส้นเล็ก ๆ ของค่าที่ผู้ใช้บันทึกเอง ไม่ระบายสี/ไม่ขีดเส้นเกณฑ์ใด ๆ (ระบบไม่แปลผลค่าสุขภาพ) */
export function Trend({ k, points }: { k: VitalKey; points: { date: string; value: number }[] }) {
  const { th, unit } = VITAL_LABEL[k];
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (points.length - 1));
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join("");
  const label = `${th} บันทึก ${points.length} ครั้ง ล่าสุด ${last.value} ${unit} เมื่อ ${last.date}`;
  return (
    <figure class="trend">
      <figcaption><strong>{th}</strong> <span class="meta">{`ล่าสุด ${last.value} ${unit}`}</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <path d={d} fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        {points.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 4 : 2.5} fill="currentColor" />)}
      </svg>
      <p class="meta trend-range">{`ค่าน้อยสุด ${lo} · มากสุด ${hi} ${unit} (จากที่คุณบันทึก)`}</p>
    </figure>
  );
}
