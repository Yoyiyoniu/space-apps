/** Paquete de textos ya declarados. No calcula una lectura. */
import { AGRI_COPY } from "./agriculture";
import {
	type AgriScience,
	type CellScience,
	type ImpactZoneRankScience,
	type ImpactZoneScience,
	impactBandNotes,
	impactZoneRankAnswer,
	type LayerScience,
	type MeasurementScience,
	NO_DATA_NOTE,
	RELIEF_NOTE,
	recentWindowNote,
	SCIENCE_SOURCES,
	SYNTHETIC_NOTE,
} from "./science";

export const PACKET_TEXT_MAX = 2000;

export type PacketKind =
	| "measurement"
	| "method"
	| "hypothesis"
	| "illustrative"
	| "event"
	| "place";

export type PacketRecord = {
	id: string;
	kind: PacketKind;
	text: string;
	synthetic: boolean;
	/** Nombre de la ficha o capa, para el pie de la respuesta. */
	label?: string;
};

export type PacketMethod = {
	id: string;
	title: string;
	body: string[];
};

export type PacketEvent = {
	id: string;
	title: string;
	detail: string;
	date: string;
	source: string;
};

export type PacketPlace = {
	id: string;
	name: string;
	description: string;
};

const lines = (parts: Array<string | null | undefined | false>) =>
	parts.filter((part): part is string => Boolean(part)).join("\n");

const AGRI_PART: Record<string, string> = {
	coverage: "Cultivos · cobertura 2021",
	noAdvice: "Cultivos · límites",
	moisture: "Humedad del suelo",
	noCause: "Cultivos · causa",
	proximity: "Cultivos · cercanía al agua",
	compareLimit: "Cultivos · comparación",
	missingCover: "Cultivos · cobertura",
	noReading: "Cultivos",
};

const recordOf = (
	id: string,
	kind: PacketKind,
	text: string,
	synthetic: boolean,
	label: string,
): PacketRecord => ({ id, kind, text, synthetic, label });

/** Nombres de ficha para el pie: de qué parte salió cada dato. */
export function sourceParts(records: PacketRecord[], ids: string[]): string[] {
	const labels = new Map(records.map((record) => [record.id, record.label]));
	const parts: string[] = [];
	for (const id of ids) {
		const label = labels.get(id) ?? id;
		if (label && !parts.includes(label)) parts.push(label);
	}
	return parts;
}

const layerText = (layer: LayerScience) =>
	lines([
		layer.name,
		layer.description,
		`Unidad: ${layer.units}`,
		`Escala: ${layer.scale}`,
		`Sin dato: ${layer.nodata}`,
		layer.dateRange && `Fechas: ${layer.dateRange}`,
		layer.referenceDate && `Referencia: ${layer.referenceDate}`,
		`Rango: ${layer.valueRange}`,
		`Fuente: ${layer.sourceName}`,
		layer.synthetic && SYNTHETIC_NOTE,
		...layer.credits.map((credit) => `${credit.name}. ${credit.attribution}`),
		...layer.classes.map((item) => item.name),
	]);

const measurementText = (record: MeasurementScience) =>
	lines([
		record.window && `Ventana: ${record.window}`,
		record.window && recentWindowNote(record.window),
		record.displacement && `Desplazamiento: ${record.displacement}`,
		record.latest &&
			`Última lectura: ${record.latest.displacement} el ${record.latest.date}`,
		record.rate && `Tasa: ${record.rate}`,
		record.status === "nodata" && NO_DATA_NOTE,
		record.status === "failed" && record.methodNote,
		record.col && `Columna: ${record.col}`,
		record.row && `Fila: ${record.row}`,
		record.lon && `Longitud: ${record.lon}`,
		record.lat && `Latitud: ${record.lat}`,
		record.cellSizeM && `Celda: ${record.cellSizeM}`,
		record.groundM && `Terreno: ${record.groundM}`,
		record.signNote,
		`Relieve: ${record.reliefExaggeration}`,
		`Hundimiento dibujado: ${record.deformExaggeration}`,
		RELIEF_NOTE,
		record.synthetic && SYNTHETIC_NOTE,
		record.status === "ready" && record.methodNote,
	]);

const cellText = (cell: CellScience) =>
	lines([
		cell.name,
		cell.value,
		cell.units && `Unidad: ${cell.units}`,
		`Fuente: ${cell.sourceName}`,
		cell.dateUsed && `Fecha: ${cell.dateUsed}`,
		cell.sourceName === SCIENCE_SOURCES.synthetic && SYNTHETIC_NOTE,
	]);

export function readingPacket(input: {
	layers: LayerScience[];
	measurement: MeasurementScience | null;
	cells: CellScience[];
	methods: PacketMethod[];
	agriZone: AgriScience | null;
	motionZones?: ImpactZoneScience[];
	motionRank?: ImpactZoneRankScience | null;
	events: PacketEvent[];
	places: PacketPlace[];
	cropLabels: readonly string[];
}): PacketRecord[] {
	const records: PacketRecord[] = [];
	if (input.measurement) {
		records.push(
			recordOf(
				"medicion",
				"measurement",
				measurementText(input.measurement),
				input.measurement.synthetic,
				"Medición de este punto",
			),
		);
	}
	for (const layer of input.layers) {
		records.push(
			recordOf(
				layer.id,
				"measurement",
				layerText(layer),
				layer.synthetic,
				layer.name,
			),
		);
	}
	input.cells.forEach((cell, index) => {
		records.push(
			recordOf(
				`celda-${index}`,
				"measurement",
				cellText(cell),
				cell.sourceName === SCIENCE_SOURCES.synthetic,
				cell.name,
			),
		);
	});
	for (const section of input.methods) {
		const hypothesis = section.id === "cerro-prieto";
		section.body.forEach((paragraph, index) => {
			records.push(
				recordOf(
					`${section.id}-${index}`,
					hypothesis ? "hypothesis" : "method",
					lines([section.title, paragraph]),
					false,
					section.title,
				),
			);
		});
	}
	for (const [key, text] of Object.entries(AGRI_COPY)) {
		records.push(
			recordOf(
				`agri-${key}`,
				"method",
				text,
				false,
				AGRI_PART[key] ?? "Cultivos",
			),
		);
	}
	if (input.cropLabels.length > 0) {
		records.push(
			recordOf(
				"cultivos-ilustrativos",
				"illustrative",
				lines([input.cropLabels.join(", "), AGRI_COPY.coverage]),
				false,
				"Cultivos ilustrativos",
			),
		);
	}
	if (input.agriZone) {
		records.push(
			recordOf(
				`zona-${input.agriZone.id}`,
				"measurement",
				lines([
					input.agriZone.label,
					input.agriZone.areaKm2,
					input.agriZone.coverClass,
					...input.agriZone.limits,
				]),
				false,
				input.agriZone.label,
			),
		);
	}
	input.motionZones?.forEach((zone, index) => {
		records.push(
			recordOf(
				`zona-mov-${index}`,
				"measurement",
				lines([
					`Zona de movimiento ${zone.rank}`,
					zone.band,
					`Extremo: ${zone.displacement}`,
					`Área: ${zone.areaKm2}`,
					`Velocidad media: ${zone.rate}`,
					zone.date && `Fecha: ${zone.date}`,
					zone.place,
					zone.people,
					zone.landUse && `Principalmente ${zone.landUse.toLowerCase()}`,
					zone.agriNote,
				]),
				false,
				`Zona de movimiento ${zone.rank}`,
			),
		);
	});
	records.push(
		recordOf(
			"zonas-umbrales",
			"method",
			lines(["Cómo se arman las zonas de hundimiento", ...impactBandNotes()]),
			false,
			"Zonas de hundimiento",
		),
	);
	if (input.motionRank) {
		records.push(
			recordOf(
				"zonas-desplazamiento",
				"measurement",
				impactZoneRankAnswer(input.motionRank),
				false,
				"Zonas de hundimiento",
			),
		);
	}
	for (const event of input.events) {
		records.push(
			recordOf(
				event.id,
				"event",
				lines([event.title, event.detail, event.date]),
				event.source === "synthetic",
				event.title,
			),
		);
	}
	for (const place of input.places) {
		records.push(
			recordOf(
				place.id,
				"place",
				lines([place.name, place.description]),
				false,
				place.name,
			),
		);
	}
	return records;
}
