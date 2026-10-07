import { describe, expect, test } from "vitest";
import { buildPayload, groupFlags, itemStatus, notCheckedLabels, rowView, SEVERITIES, unknownConditions, unsentRefs } from "./panel";
import { body, flag } from "../test/fixtures";

const item = (o: Partial<any>): any => ({ id: "i1", kind: "herb", ref: "khing", label: "ขิง", start_date: "2026-10-05", end_date: null, ...o });
const profile: any = { age: null, pregnant: null, breastfeeding: null, conditions: [] };
const T = "2026-10-07";

describe("buildPayload", () => {
  test("days_in_use from start date, unspecified profile keys are omitted", () => {
    const p = buildPayload([item({})], profile, T)!;
    expect(p.herbs).toEqual([{ id: "khing", days_in_use: 3 }]);
    expect(p.profile).toEqual({ conditions: [] });
  });

  test("answered profile values are sent (false is a real answer)", () => {
    const p = buildPayload([item({})], { ...profile, age: 60, pregnant: "no", breastfeeding: "yes" }, T)!;
    expect(p.profile).toEqual({ age: 60, pregnant: false, breastfeeding: true, conditions: [] });
  });

  test("no herbs -> null; drugs included when herbs exist", () => {
    expect(buildPayload([item({ kind: "drug", ref: "warfarin", label: "warfarin" })], profile, T)).toBeNull();
    const p = buildPayload([item({}), item({ id: "i2", kind: "drug", ref: "warfarin", label: "warfarin" })], profile, T)!;
    expect(p.drugs).toEqual(["warfarin"]);
  });

  test("days_in_use clamped to 1..365", () => {
    expect(buildPayload([item({ start_date: "2020-01-01" })], profile, T)!.herbs[0].days_in_use).toBe(365);
    expect(buildPayload([item({ start_date: "2026-10-09" })], profile, T)!.herbs[0].days_in_use).toBe(1);
  });

  test("caps at 50 herbs and 30 drugs, drugs trimmed and empty dropped, long dropped", () => {
    const herbs = Array.from({ length: 55 }, (_, i) => item({ id: `h${i}`, ref: `herb${i}` }));
    const drugs = [
      item({ id: "e", kind: "drug", ref: "   " }),
      item({ id: "l", kind: "drug", ref: "x".repeat(101) }),
      ...Array.from({ length: 35 }, (_, i) => item({ id: `d${i}`, kind: "drug", ref: ` d${i} ` })),
    ];
    const p = buildPayload([...herbs, ...drugs], profile, T)!;
    expect(p.herbs).toHaveLength(50);
    expect(p.herbs[0].id).toBe("herb0");
    expect(p.drugs).toHaveLength(30);
    expect(p.drugs[0]).toBe("d0");
  });

  test("knownConditions filters unknown codes; omitted passes through", () => {
    const pr = { ...profile, conditions: ["a", "zzz"] };
    expect(buildPayload([item({})], pr, T, ["a", "b"])!.profile.conditions).toEqual(["a"]);
    expect(buildPayload([item({})], pr, T)!.profile.conditions).toEqual(["a", "zzz"]);
  });

  test("duplicate herb ids -> one entry with the larger days_in_use", () => {
    const p = buildPayload([item({ start_date: "2026-10-05" }), item({ id: "i2", start_date: "2026-10-01" })], profile, T)!;
    expect(p.herbs).toEqual([{ id: "khing", days_in_use: 7 }]);
  });
});

test("groupFlags uses engine severity only and keeps engine order", () => {
  const r: any = { flags: [{ flag_id: "f1", severity: "avoid" }, { flag_id: "f2", severity: "info" }, { flag_id: "f3", severity: "caution" }, { flag_id: "f4", severity: "avoid" }] };
  const g = groupFlags(r);
  expect(g.avoid.map((f) => f.flag_id)).toEqual(["f1", "f4"]);
  expect(g.caution.map((f) => f.flag_id)).toEqual(["f3"]);
  expect(g.info.map((f) => f.flag_id)).toEqual(["f2"]);
});

test("itemStatus: flagged vs no_flag vs no_data (unknown input is never 'no_flag')", () => {
  const r: any = { flags: [{ herb_id: "khing" }], coverage: { unknown_inputs: ["ยาแปลก", "Foo Drug"] } };
  expect(itemStatus(item({}), r)).toBe("flagged");
  expect(itemStatus(item({ ref: "garlic" }), r)).toBe("no_flag");
  expect(itemStatus(item({ ref: "garlic" }), { ...r, coverage: { unknown_inputs: ["garlic"] } })).toBe("no_data");
  expect(itemStatus(item({ kind: "drug", ref: "ยาแปลก", label: "ยาแปลก" }), r)).toBe("no_data");
  expect(itemStatus(item({ kind: "drug", ref: "  foo drug ", label: "x" }), r)).toBe("no_data");
  expect(itemStatus(item({ kind: "drug", ref: "warfarin", label: "warfarin" }), r)).toBe("no_flag");
});

test("notCheckedLabels maps codes, unknown falls back to the code", () => {
  const r: any = { coverage: { not_checked: ["pregnancy", "mystery"] } };
  expect(notCheckedLabels(r, { pregnancy: "การตั้งครรภ์" })).toEqual(["การตั้งครรภ์", "mystery"]);
});

describe("review fixes", () => {
  const r: any = { flags: [{ herb_id: "khing" }, { herb_id: "bad" }], coverage: { unknown_inputs: ["bad"] } };
  const herbs = Array.from({ length: 51 }, (_, i) => item({ id: `h${i}`, ref: `herb${i}` }));
  const drugs = [
    ...Array.from({ length: 31 }, (_, i) => item({ id: `d${i}`, kind: "drug", ref: `d${i}` })),
    item({ id: "long", kind: "drug", ref: "x".repeat(101) }),
    item({ id: "ok100", kind: "drug", ref: "y".repeat(100) }),
  ];
  const all = [...herbs, ...drugs];

  test("unsent items are no_data, included items unaffected", () => {
    const u = unsentRefs(all);
    expect(itemStatus(herbs[50], r, u)).toBe("no_data");
    expect(itemStatus(herbs[0], r, u)).toBe("no_flag");
    expect(itemStatus(drugs[30], r, u)).toBe("no_data"); // d30 = ตัวที่ 31
    expect(itemStatus(drugs[0], r, u)).toBe("no_flag");
    expect(itemStatus(drugs[31], r, u)).toBe("no_data"); // 101 ตัวอักษร
  });

  test("herb ref over 50 chars is dropped and unsent", () => {
    const long = item({ id: "lh", ref: "z".repeat(51) });
    expect(buildPayload([item({}), long], profile, T)!.herbs).toHaveLength(1);
    expect(unsentRefs([item({}), long]).has(`herb:${"z".repeat(51)}`)).toBe(true);
  });

  test("100-char drug kept; empty array -> null; invalid start date -> 1", () => {
    expect(buildPayload([item({}), item({ id: "k", kind: "drug", ref: "y".repeat(100) })], profile, T)!.drugs).toHaveLength(1);
    expect(buildPayload([], profile, T)).toBeNull();
    expect(buildPayload([item({ start_date: "bad" })], profile, T)!.herbs[0].days_in_use).toBe(1);
  });

  test("herb no_data next to a flagged herb", () => {
    expect(itemStatus(item({}), r)).toBe("flagged");
    expect(itemStatus(item({ ref: "bad" }), r)).toBe("no_data");
  });

  test("unexpected severity goes to other, in engine order", () => {
    const g = groupFlags({ flags: [{ flag_id: "a", severity: "weird" }, { flag_id: "b", severity: "info" }, { flag_id: "c", severity: "x" }] } as any);
    expect(g.other.map((f) => f.flag_id)).toEqual(["a", "c"]);
    expect(g.info).toHaveLength(1);
  });
});

describe("rowView (ใช้ผลเฉพาะเมื่อ current)", () => {
  const none = new Set<string>();
  const ok = (b: ReturnType<typeof body>, current = true, loading = false) => ({ result: b.result, summary: b.summary, current, loading });
  const herb = item({});
  const drug = item({ id: "d", kind: "drug", ref: "warfarin" });
  const withDrug = (b: ReturnType<typeof body>) => ({ ...b, summary: { ...b.summary, drugs_as_entered: ["warfarin"] } });

  test("ควรเตือน: ผลไม่ current ห้ามให้ no_flag/ระดับ", () => {
    expect(rowView(herb, ok(body(), false, true), none)).toBe("pending");
    expect(rowView(herb, ok(body(), false, false), none)).toBe("no_data");
    expect(rowView(herb, ok(body([flag({ severity: "avoid" })]), false, false), none)).toBe("no_data");
    expect(rowView(herb, { result: null, summary: null, current: false, loading: false }, none)).toBe("no_data");
  });
  test("ไม่ควรเตือน: ผล current แสดงสถานะตามปกติ", () => {
    expect(rowView(herb, ok(body()), none)).toBe("no_flag");
    expect(rowView(herb, ok(body([flag({ severity: "info" }), flag({ flag_id: "f2", severity: "avoid" })])), none)).toBe("avoid");
    expect(rowView(herb, ok(body([flag({ severity: "weird" as any })])), none)).toBe("see_panel");
  });
  test("ยา: ไม่เคยได้ no_flag; unknown = no_data; ไม่ได้ส่ง = no_data", () => {
    expect(rowView(drug, ok(withDrug(body())), none)).toBe("see_panel");
    expect(rowView(drug, ok(withDrug(body([], { coverage: { unknown_inputs: ["Warfarin"] } }))), none)).toBe("no_data");
    expect(rowView(drug, ok(body()), none)).toBe("no_data"); // ไม่อยู่ใน drugs_as_entered
    expect(rowView(herb, ok(body()), new Set(["herb:khing"]))).toBe("no_data");
  });
  test("SEVERITIES เรียงจากรุนแรงสุด และ unknownConditions", () => {
    expect(SEVERITIES).toEqual(["avoid", "caution", "info"]);
    expect(unknownConditions({ ...profile, conditions: ["htn", "zzz"] }, ["htn"])).toEqual(["zzz"]);
  });
});
