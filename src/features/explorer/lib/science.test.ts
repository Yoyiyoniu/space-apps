import { describe, expect, it } from "vitest";
import type { Layer, Region } from "../manifest";
import { Band } from "./impact";
import {
	ASSISTANT_COPY,
	agriZoneScience,
	cellScience,
	dateRangeLabel,
	formatMagnitude,
	IMPACT_AGRI_NOTE,
	impactBandNotes,
	impactZoneRankAnswer,
	impactZoneRankScience,
	impactZoneScience,
	isZoneRankQuestion,
	layerScience,
	measurementScience,
	NO_DATA_NOTE,
	SYNTHETIC_NOTE,
	ZONE_RATE_MISSING,
} from "./science";

const continuous = {
	id: "hh",
	type: "raster",
	theme: "surface",
	name: "Construcciones",
	description: "Retrodispersión HH.",
	units: "dB",
	path: "hh.bin",
	encoding: "int16-le",
	scale: 0.5,
	nodata: -32768,
	dates: ["2025-01-01", "2025-02-01"],
	referenceDate: null,
	valueRange: [-20, 5],
	paint: "sequential",
	palette: "gray",
	classes: [],
	source: "synthetic",
	products: ["NISAR_L2_GUNW_001"],
	credits: [
		{
			name: "Datos sintéticos de desarrollo",
			attribution: "No son mediciones.",
			url: "https://example.test",
		},
	],
	segments: [],
} as unknown as Layer;

const land = {
	id: "land",
	type: "raster",
	theme: "impact",
	name: "Uso de suelo",
	description: "Cobertura 2021.",
	units: "clase",
	path: "land.bin",
	encoding: "uint8",
	scale: 1,
	nodata: 0,
	dates: [],
	referenceDate: "2021-01-01",
	valueRange: [0, 8],
	paint: "categorical",
	palette: "greens",
	classes: [{ value: 2, name: "Cultivos", color: "#123456" }],
	source: "esa-worldcover",
	products: [],
	credits: [],
	segments: [],
} as unknown as Layer;

const region = { width: 2, height: 1 } as Pick<Region, "width" | "height">;

describe("dateRangeLabel", () => {
	it("usa raya entre la primera y la última fecha", () => {
		expect(dateRangeLabel(["2025-01-01", "2025-06-01"])).toBe(
			"2025-01-01–2025-06-01",
		);
		expect(dateRangeLabel(["2025-01-01"])).toBe("2025-01-01");
		expect(dateRangeLabel([])).toBeNull();
	});
});

describe("formatMagnitude", () => {
	it("pone signo y unidad inseparable", () => {
		expect(formatMagnitude(1.24, "cm")).toBe("+\u0031.2\u00a0cm");
		expect(formatMagnitude(-3.41, "cm/año")).toBe("-3.4\u00a0cm/año");
	});
});

describe("layerScience", () => {
	it("marca fuente sintética y deja productos y créditos", () => {
		const record = layerScience(continuous);
		expect(record.synthetic).toBe(true);
		expect(record.sourceName).toBe("Datos simulados");
		expect(record.products).toEqual(["NISAR_L2_GUNW_001"]);
		expect(record.nodata).toBe("-32768");
		expect(record.scale).toBe("0.5");
		expect(record.valueRange).toContain("dB");
	});
	it("expone clases de una capa categórica", () => {
		const record = layerScience(land);
		expect(record.classes).toEqual([
			{ value: 2, name: "Cultivos", color: "#123456" },
		]);
		expect(record.sourceName).toBe("ESA WorldCover");
	});
});

describe("cellScience", () => {
	it("lee una continua y anota sin dato", () => {
		const data = Int16Array.from([10, 20, 30, -32768]);
		expect(
			cellScience(continuous, data, region, 0.5, 0.5, "2025-02-01", {
				loading: false,
				failed: false,
			}),
		).toMatchObject({
			value: "15.0 dB",
			missing: false,
			sourceName: "Datos simulados",
			dateUsed: "2025-02-01",
		});
		expect(
			cellScience(continuous, data, region, 1.5, 0.5, "2025-02-01", {
				loading: false,
				failed: false,
			}).value,
		).toBe(NO_DATA_NOTE);
	});
	it("lee una categórica estática", () => {
		const data = Uint8Array.from([2, 0]);
		const reading = cellScience(land, data, region, 0.5, 0.5, null, {
			loading: false,
			failed: false,
		});
		expect(reading.value).toBe("Cultivos");
		expect(reading.dateUsed).toBe("2021-01-01");
	});
	it("distingue carga y fallo", () => {
		expect(
			cellScience(continuous, undefined, region, 0.5, 0.5, null, {
				loading: true,
				failed: false,
			}).loading,
		).toBe(true);
		expect(
			cellScience(continuous, undefined, region, 0.5, 0.5, null, {
				loading: false,
				failed: true,
			}).failed,
		).toBe(true);
	});
});

describe("measurementScience", () => {
	const base = {
		dates: ["2025-01-01", "2025-07-01"],
		dateIndex: 1,
		rate: -4.2,
		cellSizeM: 200,
		groundM: 12.4,
		reliefExaggeration: 3,
		deformExaggeration: 2000,
		source: "synthetic" as const,
		methodNote: "Se hunde moderado",
	};
	it("vacío sin sonda", () => {
		const record = measurementScience({
			...base,
			probe: null,
			series: null,
			loading: false,
			failed: false,
		});
		expect(record.status).toBe("empty");
		expect(record.synthetic).toBe(true);
		expect(record.window).toBe("2025-01-01–2025-07-01");
	});
	it("nodoata cuando la serie pierde coherencia", () => {
		const record = measurementScience({
			...base,
			probe: { col: 1.2, row: 3.4, lon: -115.4, lat: 32.6 },
			series: [-1.1, null],
			loading: false,
			failed: false,
		});
		expect(record.status).toBe("nodata");
		expect(record.rate).toBe("-4.2\u00a0cm/año");
		expect(record.latest).toEqual({
			date: "2025-01-01",
			displacement: "-1.1\u00a0cm",
		});
	});
	it("lista desplazamiento y tasa", () => {
		const record = measurementScience({
			...base,
			probe: { col: 1.2, row: 3.4, lon: -115.4, lat: 32.6 },
			series: [0, -8.16],
			loading: false,
			failed: false,
		});
		expect(record.status).toBe("ready");
		expect(record.displacement).toBe("-8.2\u00a0cm");
		expect(record.groundM).toBe("12\u00a0m");
		expect(record.deformExaggeration).toBe("×2000");
	});
});

describe("impactBandNotes", () => {
	it("declara los umbrales de banda", () => {
		const notes = impactBandNotes().join(" ");
		expect(notes).toContain("-10.0");
		expect(notes).toContain("10, 5 y 2");
	});
});

describe("impactZoneScience", () => {
	const zone = {
		band: Band.HIGH,
		valueCm: -12.04,
		areaKm2: 9,
		meanVelocity: -4.2,
	};

	it("copia banda, extremo, área y nota de cultivos", () => {
		const record = impactZoneScience(zone, {
			rank: 1,
			date: "2025-10-25",
			people: 1234,
			landUse: "Cultivos",
			place: "A 1.2 km de Cerro Prieto",
			synthetic: true,
		});
		expect(record.band).toBe("Hundimiento alto");
		expect(record.displacement).toBe("-12.0\u00a0cm");
		expect(record.areaKm2).toBe("9.00\u00a0km²");
		expect(record.rate).toBe("-4.2\u00a0cm/año");
		expect(record.people).toBe("≈ 1200 personas");
		expect(record.place).toBe("A 1.2 km de Cerro Prieto");
		expect(record.synthetic).toBe(true);
		expect(record.agriNote).toBe(IMPACT_AGRI_NOTE);
		expect(JSON.stringify(record)).not.toContain("cells");
	});

	it("sin velocidad usa la frase fija", () => {
		const record = impactZoneScience(
			{ ...zone, meanVelocity: null },
			{
				rank: 1,
				date: null,
				people: null,
				landUse: null,
				place: null,
				synthetic: false,
			},
		);
		expect(record.rate).toBe(ZONE_RATE_MISSING);
		expect(record.people).toBeNull();
	});
});

describe("impactZoneRankScience", () => {
	it("lista las zonas ya ordenadas", () => {
		const first = impactZoneScience(
			{
				band: Band.HIGH,
				valueCm: -12,
				areaKm2: 9,
				meanVelocity: -4,
			},
			{
				rank: 1,
				date: "2025-10-25",
				people: null,
				landUse: "Cultivos",
				place: "Sobre Cerro Prieto",
				synthetic: true,
			},
		);
		const rank = impactZoneRankScience({
			date: "2025-10-25",
			zones: [first],
			synthetic: true,
		});
		expect(rank.empty).toBe(false);
		expect(rank.lines[0]).toContain("1 zona");
		expect(rank.lines[0]).toContain("hasta 5");
		expect(rank.lines[1]).toContain("1 km²");
		expect(rank.lines.join(" ")).toContain("-12.0");
		expect(rank.lines.join(" ")).toContain("Sobre Cerro Prieto");
		expect(rank.agriNote).toBe(IMPACT_AGRI_NOTE);
		expect(rank.synthetic).toBe(true);
	});

	it("sin zonas no inventa un extremo", () => {
		const rank = impactZoneRankScience({
			date: "2025-10-01",
			zones: [],
			synthetic: false,
		});
		expect(rank.empty).toBe(true);
		expect(rank.lines[0]).toContain("1 km²");
		expect(rank.lines.join()).not.toContain("cm");
	});

	it("arma la lista que lee la persona", () => {
		const first = impactZoneScience(
			{
				band: Band.HIGH,
				valueCm: -12,
				areaKm2: 9,
				meanVelocity: -4,
			},
			{
				rank: 1,
				date: "2025-10-25",
				people: null,
				landUse: null,
				place: "Sobre Cerro Prieto",
				synthetic: true,
			},
		);
		const text = impactZoneRankAnswer(
			impactZoneRankScience({
				date: "2025-10-25",
				zones: [first],
				synthetic: true,
			}),
		);
		expect(text).toContain("más hundimiento");
		expect(text).toContain("-12.0");
		expect(text).toContain("Sobre Cerro Prieto");
		expect(text).not.toContain(SYNTHETIC_NOTE);
		expect(isZoneRankQuestion(ASSISTANT_COPY.askPrompts[0])).toBe(true);
		expect(isZoneRankQuestion("¿Qué significan los colores del mapa?")).toBe(
			false,
		);
	});
});

describe("agriZoneScience", () => {
	it("incluye umbrales y límites de la zona", () => {
		const record = agriZoneScience({
			id: 0,
			areaKm2: 3.5,
			cells: [1, 2, 3],
			minCell: 1,
			col: 10.2,
			row: 4.8,
		});
		expect(record.areaKm2).toBe("3.50\u00a0km²");
		expect(record.cells).toBe("3");
		expect(record.thresholds[0]).toContain("3 dB");
		expect(record.coverClass).toContain("WorldCover");
	});
});

describe("avisos", () => {
	it("conserva las frases de método", () => {
		expect(NO_DATA_NOTE).toContain("coherencia");
		expect(SYNTHETIC_NOTE).toContain("No son una medición NISAR");
		expect(ASSISTANT_COPY.outside).toContain("no incluyen");
		expect(ASSISTANT_COPY.unverified).toContain("No muestro");
		expect(ASSISTANT_COPY.unavailable).toContain("No puedo responder");
		expect(ASSISTANT_COPY.failed).toContain("No se pudo producir");
		expect(ASSISTANT_COPY.askTitle).toContain("mediciones");
		expect(ASSISTANT_COPY.askDescription).toContain("Escribe aquí tu pregunta");
		expect(ASSISTANT_COPY.askPlaceholder).toBe("Escribe aquí tu pregunta");
		expect(ASSISTANT_COPY.askMore).toContain("preguntar");
		expect(ASSISTANT_COPY.askPrompts[0]).toContain("hundido más");
		expect(ASSISTANT_COPY.noZoneRank).toContain("ranking");
	});
});
