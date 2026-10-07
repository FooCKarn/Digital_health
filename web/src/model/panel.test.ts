import { describe, expect, test } from "vitest";
import { buildPayload, groupFlags, itemStatus, notCheckedLabels } from "./panel";

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
