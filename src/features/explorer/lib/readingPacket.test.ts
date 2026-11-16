import { describe, expect, it } from "vitest";
import type { Layer } from "../manifest";
import { METHOD_SECTIONS } from "../ui/Overlays";
import { AGRI_COPY } from "./agriculture";
import { Band } from "./impact";
import { CROP_VARIANTS } from "./mapModels";
import { PACKET_TEXT_MAX, readingPacket, sourceParts } from "./readingPacket";
import { probeTemporalText } from "./temporal";
import {
	cellScience,
	IMPACT_AGRI_NOTE,
	impactZoneRankScience,
	impactZoneScience,
	layerScience,
	measurementScience,
	NO_DATA_NOTE,
	SYNTHETIC_NOTE,
} from "./science";

const layer = {
	id: "subsidence",
	type: "los-displacement",
	theme: "movement",
	name: "Hundimiento",
	description: "Desplazamiento en línea de vista.",
	units: "cm",
	path: "cube.bin",
	encoding: "int16-le",
	scale: 0.1,
	nodata: -32768,
	dates: ["2025-10-01", "2025-10-25"],
	referenceDate: null,
	valueRange: [-9.6, 0.7],
	paint: "diverging",
	palette: "vik",
	classes: [],
	source: "synthetic",
	products: [],
	credits: [
		{
			name: "Datos sintéticos de desarrollo",
			attribution: "No son mediciones NISAR.",
			url: "https://example.test",
		},
	],
	segments: [],
} as unknown as Layer;

const base = {
	dates: ["2025-10-01", "2025-10-25"],
	dateIndex: 1,
	rate: -4.2,
	cellSizeM: 117,
	groundM: 12,
	reliefExaggeration: 3,
	deformExaggeration: 2000,
	source: "synthetic" as const,
	methodNote: null,
	loading: false,
	failed: false,
};

describe("readingPacket", () => {
	it("copia el desplazamiento ya formateado y la nota sintética", () => {
		const measurement = measurementScience({
			...base,
			probe: { col: 1, row: 2, lon: -115.2, lat: 32.4 },
			series: [0, -8.16],
		});
		const records = readingPacket({
			layers: [layerScience(layer)],
			measurement,
			temporalText: null,
			cells: [],
			methods: [],
			agriZone: null,
			events: [],
			places: [],
			cropLabels: [],
		});
		const medicion = records.find((record) => record.id === "medicion");
		expect(medicion?.synthetic).toBe(true);
		expect(medicion?.text).toContain(measurement.displacement);
		expect(medicion?.text).toContain(SYNTHETIC_NOTE);
	});

	it("sin sonda no escribe una cifra de la celda", () => {
		const measurement = measurementScience({
			...base,
			probe: null,
			series: null,
		});
		const text =
			readingPacket({
				layers: [],
				measurement,
				temporalText: null,
				cells: [],
				methods: [],
				agriZone: null,
				events: [],
				places: [],
				cropLabels: [],
			}).find((record) => record.id === "medicion")?.text ?? "";
		expect(text).not.toContain("Desplazamiento:");
		expect(text).not.toContain("0\u00a0cm");
	});

	it("sin lectura en esta fecha declara la ventana y la última cifra", () => {
		const measurement = measurementScience({
			...base,
			probe: { col: 1, row: 2, lon: -115.2, lat: 32.4 },
			series: [-8.16, null],
			dateIndex: 1,
		});
		const text =
			readingPacket({
				layers: [],
				measurement,
				temporalText: null,
				cells: [],
				methods: [],
				agriZone: null,
				events: [],
				places: [],
				cropLabels: [],
			}).find((record) => record.id === "medicion")?.text ?? "";
		expect(text).toContain(
			"La información más reciente que tengo sobre esto es de",
		);
		expect(text).toContain("2025-10-01–2025-10-25");
		expect(text).toContain("-8.2");
		expect(text).toContain("2025-10-01");
		expect(text).not.toContain("Desplazamiento:");
	});

	it("una celda sin dato usa la nota y no un cero", () => {
		const missing = cellScience(
			layer,
			Int16Array.from([-32768]),
			{ width: 1, height: 1 },
			0,
			0,
			"2025-10-01",
			{ loading: false, failed: false },
		);
		expect(missing.value).toBe(NO_DATA_NOTE);
		const text = readingPacket({
			layers: [],
			measurement: null,
			temporalText: null,
			cells: [missing],
			methods: [],
			agriZone: null,
			events: [],
			places: [],
			cropLabels: [],
		})[0]?.text;
		expect(text).toContain(NO_DATA_NOTE);
		expect(text).not.toContain("0\u00a0cm");
		expect(text).not.toContain("0 cm");
	});

	it("marca la hipótesis, los cultivos ilustrativos y la cobertura", () => {
		const records = readingPacket({
			layers: [],
			measurement: null,
			cells: [],
			methods: METHOD_SECTIONS,
			agriZone: null,
			events: [],
			places: [],
			cropLabels: CROP_VARIANTS.map((variant) => variant.label),
		});
		expect(
			records.find((record) => record.id.startsWith("cerro-prieto"))?.kind,
		).toBe("hypothesis");
		expect(records.find((record) => record.id === "sar-0")?.kind).toBe(
			"method",
		);
		const crops = records.find(
			(record) => record.id === "cultivos-ilustrativos",
		);
		expect(crops?.kind).toBe("illustrative");
		expect(crops?.text).toContain("Trigo");
		expect(crops?.text).toContain(AGRI_COPY.coverage);
		expect(crops?.label).toBe("Cultivos ilustrativos");
		expect(
			records.every((record) => record.text.length <= PACKET_TEXT_MAX),
		).toBe(true);
		expect(sourceParts(records, ["sar-0", "sar-0", "ajena"])).toEqual([
			"Qué es SAR",
			"ajena",
		]);
	});

	it("copia el ranking de hundimiento y no las celdas", () => {
		const zone = impactZoneScience(
			{
				band: Band.HIGH,
				valueCm: -12,
				areaKm2: 9,
				meanVelocity: -4,
			},
			{
				rank: 1,
				date: "2025-10-25",
				people: 1200,
				landUse: "Cultivos",
				place: "Sobre Cerro Prieto",
				synthetic: true,
			},
		);
		const records = readingPacket({
			layers: [],
			measurement: null,
			cells: [],
			methods: [],
			agriZone: null,
			motionZones: [zone],
			motionRank: impactZoneRankScience({
				date: "2025-10-25",
				zones: [zone],
				synthetic: true,
			}),
			events: [],
			places: [],
			cropLabels: [],
		});
		const ranked = records.find(
			(record) => record.id === "zonas-desplazamiento",
		);
		const listed = records.find((record) => record.id === "zona-mov-0");
		expect(ranked?.text).toContain("-12.0");
		expect(ranked?.text).toContain(IMPACT_AGRI_NOTE);
		expect(ranked?.text).not.toContain(SYNTHETIC_NOTE);
		expect(ranked?.label).toBe("Zonas de hundimiento");
		expect(listed?.text).toContain("Hundimiento alto");
		expect(
			records.find((record) => record.id === "zonas-umbrales")?.text,
		).toContain("10, 5 y 2");
		expect(listed?.text).not.toContain("cells");
		expect(
			records.every((record) => record.text.length <= PACKET_TEXT_MAX),
		).toBe(true);
	});
});
