import { describe, expect, it } from "vitest";
import {
	activeProbePoint,
	probePoints,
	probeTemporalText,
} from "./temporal";

describe("probePoints", () => {
	it("omite fechas sin dato", () => {
		const points = probePoints([-2, null, -5], [
			"2025-10-01",
			"2025-10-25",
			"2025-11-18",
		]);
		expect(points).toHaveLength(2);
		expect(points[1]?.value).toBe(-5);
	});
});

describe("activeProbePoint", () => {
	it("usa la última lectura válida en o antes del índice", () => {
		const points = probePoints([-2, null, -5], [
			"2025-10-01",
			"2025-10-25",
			"2025-11-18",
		]);
		expect(activeProbePoint(points, 1)?.date).toBe("2025-10-01");
		expect(activeProbePoint(points, 2)?.date).toBe("2025-11-18");
	});
});

describe("probeTemporalText", () => {
	it("declara saltos entre fechas y entre meses", () => {
		const text = probeTemporalText(
			[-2, -3.4, -5],
			["2025-10-01", "2025-11-18", "2025-12-12"],
			2,
		);
		expect(text).toContain("Serie de desplazamiento");
		expect(text).toContain("2025-10-01 → 2025-11-18: diferencia -1.4\u00a0cm");
		expect(text).toContain("Comparación aproximada entre meses");
		expect(text).toContain("octubre de 2025");
	});

	it("null si toda la serie es sin dato", () => {
		expect(
			probeTemporalText([null, null], ["2025-10-01", "2025-11-18"], 0),
		).toBeNull();
	});
});