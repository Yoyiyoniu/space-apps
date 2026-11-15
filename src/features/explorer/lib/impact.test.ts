import { describe, expect, it } from "vitest";
import {
	accelerationField,
	accelerationReading,
	Band,
	boxSmooth,
	classify,
	createImpactAnalysis,
	datePlane,
	differentialField,
	differentialReading,
	rankedSubsidenceZones,
	zoneContext,
	zoneMap,
	zoneReading,
} from "./impact";

const ND = -32768;

describe("classify", () => {
	it.each([
		[Number.NaN, Band.NODATA],
		[0, Band.NONE],
		[-1.9, Band.NONE],
		[1.9, Band.NONE],
		[-2, Band.LOW],
		[-4.9, Band.LOW],
		[-5, Band.MID],
		[-9.9, Band.MID],
		[-10, Band.HIGH],
		[2, Band.UP],
	])("%s", (cm, band) => {
		expect(classify(cm)).toBe(band);
	});
});

describe("boxSmooth", () => {
	it("promedia ignorando NaN y conserva los NaN", () => {
		const f = Float32Array.from([0, Number.NaN, 6]);
		const s = boxSmooth(f, 3, 1, 1);
		expect(s[0]).toBe(0);
		expect(s[1]).toBeNaN();
		expect(s[2]).toBe(6);
		const g = boxSmooth(Float32Array.from([0, 3, 6]), 3, 1, 1);
		expect(g[1]).toBeCloseTo(3);
	});
});

describe("zoneMap", () => {
	// 6x6, celdas de 1 km: bloque 3x3 hundido, un píxel aislado y una zona que se acerca
	const W = 6;
	const field = new Float32Array(36);
	for (const [i, j] of [
		[0, 0],
		[1, 0],
		[2, 0],
		[0, 1],
		[1, 1],
		[2, 1],
		[0, 2],
		[1, 2],
		[2, 2],
	])
		field[j * W + i] = -6;
	field[1 * W + 1] = -12;
	field[5 * W + 0] = 3;
	field[5 * W + 1] = 3;
	field[3 * W + 5] = Number.NaN;
	const velocity = new Float32Array(36).fill(-4);
	velocity[2] = Number.NaN;

	it("agrupa, ordena por área y resume cada zona", () => {
		const { zones, bands } = zoneMap(field, W, 6, velocity, 1000);
		expect(zones.map((z) => z.kind)).toEqual(["down", "up"]);
		const z = zones[0];
		expect(z.areaKm2).toBe(9);
		expect(z.band).toBe(Band.HIGH);
		expect([z.col, z.row]).toEqual([1.5, 1.5]);
		expect(z.valueCm).toBe(-12);
		expect(z.meanVelocity).toBeCloseTo(-4);
		expect(bands[1 * W + 1]).toBe(Band.HIGH);
		expect(bands[0]).toBe(Band.MID);
		expect(bands[3 * W + 5]).toBe(Band.NODATA);
	});

	it("descarta áreas menores a 1 km²", () => {
		const small = new Float32Array(36);
		small[7] = -20;
		const { zones, bands } = zoneMap(small, W, 6, velocity, 500); // 0.25 km²
		expect(zones).toEqual([]);
		expect(bands[7]).toBe(Band.NONE);
	});

	it("sin cambio no hay zonas (primera fecha)", () => {
		expect(zoneMap(new Float32Array(36), W, 6, velocity, 1000).zones).toEqual(
			[],
		);
	});

	it("el ranking de hundimiento pone primero el extremo más bajo", () => {
		const { zones } = zoneMap(field, W, 6, velocity, 1000);
		const shallow: (typeof zones)[number] = {
			...zones[0],
			kind: "down",
			valueCm: -3,
		};
		const ranked = rankedSubsidenceZones([zones[1], shallow, zones[0]], 2);
		expect(ranked.map((zone) => zone.valueCm)).toEqual([-12, -3]);
		expect(ranked.every((zone) => zone.kind === "down")).toBe(true);
	});

	it("velocidad media null si no hay velocidades válidas", () => {
		const f = new Float32Array(36).fill(-3);
		const v = new Float32Array(36).fill(Number.NaN);
		expect(zoneMap(f, W, 6, v, 1000).zones[0].meanVelocity).toBeNull();
	});
});

describe("zoneContext", () => {
	it("suma personas y elige el uso predominante", () => {
		const c = zoneContext({ cells: [0, 1, 2] }, [10, 20, 0], [5, 5, 6], {
			5: "Cultivos",
			6: "Zona urbana",
		});
		expect(c).toEqual({ people: 30, landUse: "Cultivos" });
	});
	it("sin datos no inventa valores", () => {
		expect(zoneContext({ cells: [0] }, null, null, {})).toEqual({
			people: null,
			landUse: null,
		});
		expect(zoneContext({ cells: [0] }, [0], [1], {}).people).toBeNull();
	});
});

describe("differentialField", () => {
	it("mide un escalón conocido en cm/km y da NaN sin vecinos", () => {
		// rampa de 1 cm por celda de 500 m = 2 cm/km
		const W = 5;
		const f = new Float32Array(25);
		for (let p = 0; p < 25; p++) f[p] = p % W;
		const d = differentialField(f, W, 5, 500);
		expect(d[2 * W + 2]).toBeCloseTo(2);
		expect(d[0]).toBeNaN();
		f[2 * W + 3] = Number.NaN;
		expect(differentialField(f, W, 5, 500)[2 * W + 2]).toBeNaN();
	});
});

describe("accelerationField", () => {
	const dates = [
		"2024-01-01",
		"2024-07-01",
		"2025-01-01",
		"2025-07-01",
		"2026-01-01",
	];
	const info = { width: 1, height: 1, dates, scale: 0.1, nodata: ND };

	it("negativo si el hundimiento se acelera", () => {
		const a = accelerationField(
			Int16Array.from([0, -10, -20, -60, -100]),
			info,
		);
		expect(a?.[0]).toBeLessThan(-1);
	});
	it("positivo si se frena", () => {
		const a = accelerationField(
			Int16Array.from([0, -60, -100, -110, -120]),
			info,
		);
		expect(a?.[0]).toBeGreaterThan(1);
	});
	it("casi cero si es lineal", () => {
		const a = accelerationField(
			Int16Array.from([0, -25, -50, -75, -100]),
			info,
		);
		expect(Math.abs(a?.[0] ?? 9)).toBeLessThan(0.2);
	});
	it("null con menos de 4 fechas", () => {
		expect(
			accelerationField(Int16Array.from([0, 0, 0]), {
				...info,
				dates: dates.slice(0, 3),
			}),
		).toBeNull();
	});
});

describe("createImpactAnalysis", () => {
	it("memoriza por fecha", () => {
		const info = {
			width: 2,
			height: 2,
			dates: ["2025-01-01", "2026-01-01"],
			scale: 0.1,
			nodata: ND,
		};
		const cube = Int16Array.from([0, 0, 0, 0, -100, -100, -100, ND]);
		expect(datePlane(cube, info, 1)[3]).toBeNaN();
		const a = createImpactAnalysis(cube, info, new Float32Array(4), 1000);
		expect(a.zones(1)).toBe(a.zones(1));
		expect(a.acceleration()).toBeNull();
	});
});

describe("lecturas de la sonda", () => {
	it("zonas", () => {
		expect(zoneReading(Band.HIGH)).toBe("Zona de hundimiento alto");
		expect(zoneReading(Band.UP)).toBe("Zona más alta");
		expect(zoneReading(Band.NODATA)).toBeNull();
	});
	it("diferencial y aceleración", () => {
		expect(differentialReading(1.26)).toContain("1.3 cm por km");
		expect(differentialReading(Number.NaN)).toBeNull();
		expect(accelerationReading(-2)).toBe("Se acelera 2.0 cm/año");
		expect(accelerationReading(2)).toBe("Se frena 2.0 cm/año");
		expect(accelerationReading(0.1)).toBe("Ritmo sin cambio claro");
	});
});
