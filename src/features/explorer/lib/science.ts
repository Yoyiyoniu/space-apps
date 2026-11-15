/** Fichas científicas a partir del manifiesto, las lecturas y la sonda. Lógica pura. */
import type { Credit, Layer, Region } from "../manifest";
import {
	AGRI_COPY,
	type AgriZone,
	HV_DELTA_DB,
	MIN_ZONE_KM2,
	SIGNAL_SHARE,
	WATERWAY_MAX_M,
} from "./agriculture";
import {
	NO_READING,
	nearestDateIndex,
	type RasterData,
	readLayer,
	sourceAt,
} from "./catalog";
import {
	BAND_LIMITS,
	BAND_NAMES,
	type BandValue,
	MIN_ZONE_KM2 as IMPACT_MIN_KM2,
	MAX_LABELED_ZONES,
	type Zone,
} from "./impact";

export const NO_DATA_NOTE =
	"Sin dato. El radar perdió coherencia en esta celda.";
export const SYNTHETIC_NOTE = "Datos simulados. No son una medición NISAR.";
export const ASSISTANT_COPY = {
	outside: "Los datos reunidos no incluyen ese dato.",
	recent: "La información más reciente que tengo sobre esto es de",
	unverified:
		"No muestro esa respuesta: una cifra no está en los datos reunidos.",
	unavailable: "No puedo responder. El modelo no está configurado.",
	failed: "No se pudo producir la respuesta.",
	pending: "Consultando los datos reunidos…",
	takenFrom: "Datos tomados de",
	askTitle: "Consulta las mediciones",
	askDescription:
		"Escribe aquí tu pregunta sobre el hundimiento, la fecha o el punto que estás viendo.",
	askPlaceholder: "Escribe aquí tu pregunta",
	askMore: "También puedes preguntar",
	askPrompts: [
		"De todo el mapa, ¿cuáles zonas se han hundido más?",
		"¿Cuánto se movió el suelo en este punto?",
		"¿Qué significan los colores del mapa?",
		"¿De dónde salen estos datos?",
		"¿Por qué se hunde Cerro Prieto?",
		"¿El relieve del mapa está exagerado?",
		"¿Qué cultivos hay en el valle?",
		"¿Qué eventos hay en estas fechas?",
	],
	noZoneRank:
		"Todavía no tengo el ranking de hundimiento de esta fecha. Cuando esté el cubo te listo las zonas.",
} as const;
export const LOS_SIGN = "Negativo: el suelo se aleja del satélite.";
export const RELIEF_NOTE =
	"Ilustrativa. El dato real es el color y los centímetros.";
export const IMPACT_AGRI_NOTE =
	"Estas zonas de hundimiento no son las zonas agrícolas del menú Cultivos.";
export const ZONE_RATE_MISSING = "velocidad no disponible";

export const SCIENCE_SOURCES: Record<Layer["source"], string> = {
	nisar: "NISAR",
	"sentinel-1": "Sentinel-1",
	synthetic: "Datos simulados",
	derived: "Dato derivado",
	"esa-worldcover": "ESA WorldCover",
	worldpop: "WorldPop",
};

export type LayerScience = {
	id: string;
	name: string;
	description: string;
	units: string;
	scale: string;
	nodata: string;
	encoding: string;
	dates: string[];
	dateRange: string | null;
	referenceDate: string | null;
	valueRange: string;
	paint: string;
	palette: string;
	classes: Array<{ value: number; name: string; color: string }>;
	source: Layer["source"];
	sourceName: string;
	products: string[];
	credits: Credit[];
	synthetic: boolean;
};

export type CellScience = {
	name: string;
	value: string;
	units: string;
	sourceName: string;
	dateUsed: string | null;
	missing: boolean;
	loading: boolean;
	failed: boolean;
};

export type MeasurementStatus =
	| "empty"
	| "loading"
	| "failed"
	| "nodata"
	| "ready";

export type LatestReading = {
	date: string;
	displacement: string;
};

export type MeasurementScience = {
	status: MeasurementStatus;
	displacement: string | null;
	latest: LatestReading | null;
	rate: string | null;
	window: string | null;
	signNote: string;
	col: string | null;
	row: string | null;
	lon: string | null;
	lat: string | null;
	cellSizeM: string | null;
	groundM: string | null;
	reliefExaggeration: string;
	deformExaggeration: string;
	synthetic: boolean;
	methodNote: string | null;
};

export type AgriScience = {
	id: number;
	label: string;
	areaKm2: string;
	cells: string;
	centroid: string;
	coverClass: string;
	thresholds: string[];
	limits: string[];
};

export type ImpactZoneScience = {
	rank: number;
	band: string;
	displacement: string;
	areaKm2: string;
	rate: string;
	date: string | null;
	people: string | null;
	landUse: string | null;
	place: string | null;
	synthetic: boolean;
	agriNote: string;
};

export type ImpactZoneRankScience = {
	date: string | null;
	empty: boolean;
	lines: string[];
	agriNote: string;
	synthetic: boolean;
};

export function recentWindowNote(window: string | null): string | null {
	if (!window) return null;
	return `${ASSISTANT_COPY.recent} ${window}.`;
}

/** Última cifra de la serie en o antes de la fecha activa. */
export function latestSeriesReading(
	series: Array<number | null>,
	dates: string[],
	dateIndex: number,
): LatestReading | null {
	const start = Math.min(Math.max(dateIndex, 0), series.length - 1);
	for (let index = start; index >= 0; index--) {
		const value = series[index];
		const date = dates[index];
		if (value !== null && date) {
			return { date, displacement: formatMagnitude(value, "cm") };
		}
	}
	return null;
}

/** Rango de fechas con raya. */
export function dateRangeLabel(dates: string[]): string | null {
	if (dates.length === 0) return null;
	if (dates.length === 1) return dates[0];
	return `${dates[0]}\u2013${dates[dates.length - 1]}`;
}

/** Magnitud con signo, unidad inseparable y cifras tabulares. */
export function formatMagnitude(
	value: number,
	units: string,
	digits = 1,
): string {
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(digits)}\u00a0${units}`;
}

export function sourceName(source: Layer["source"]): string {
	return SCIENCE_SOURCES[source];
}

export function layerScience(layer: Layer): LayerScience {
	const [lo, hi] = layer.valueRange;
	return {
		id: layer.id,
		name: layer.name,
		description: layer.description,
		units: layer.units,
		scale: String(layer.scale),
		nodata: String(layer.nodata),
		encoding: layer.encoding,
		dates: layer.dates,
		dateRange: dateRangeLabel(layer.dates),
		referenceDate: layer.referenceDate,
		valueRange: `${lo.toFixed(1)}\u2013${hi.toFixed(1)}\u00a0${layer.units}`,
		paint: layer.paint,
		palette: layer.palette,
		classes: layer.classes,
		source: layer.source,
		sourceName: sourceName(layer.source),
		products: layer.products,
		credits: layer.credits,
		synthetic: layer.source === "synthetic",
	};
}

export function cellScience(
	layer: Layer,
	data: RasterData | undefined,
	region: Pick<Region, "width" | "height">,
	col: number,
	row: number,
	date: string | null,
	state: { loading: boolean; failed: boolean },
): CellScience {
	const index = nearestDateIndex(layer.dates, date);
	const dateUsed =
		index >= 0
			? (layer.dates[index] ?? layer.referenceDate)
			: layer.referenceDate;
	if (state.failed) {
		return {
			name: layer.name,
			value: "No se pudo cargar esta capa. Recarga la página.",
			units: layer.units,
			sourceName: sourceName(sourceAt(layer, date)),
			dateUsed,
			missing: true,
			loading: false,
			failed: true,
		};
	}
	if (!data || state.loading) {
		return {
			name: layer.name,
			value: "Cargando mediciones…",
			units: layer.units,
			sourceName: sourceName(sourceAt(layer, date)),
			dateUsed,
			missing: false,
			loading: true,
			failed: false,
		};
	}
	const value = readLayer(layer, data, region, col, row, date);
	const missing = value === NO_READING;
	return {
		name: layer.name,
		value: missing ? NO_DATA_NOTE : value,
		units: layer.units,
		sourceName: sourceName(sourceAt(layer, date)),
		dateUsed,
		missing,
		loading: false,
		failed: false,
	};
}

export function measurementScience(input: {
	probe: { col: number; row: number; lon: number; lat: number } | null;
	series: Array<number | null> | null;
	dateIndex: number;
	dates: string[];
	rate: number | null;
	cellSizeM: number;
	groundM: number | null;
	reliefExaggeration: number;
	deformExaggeration: number;
	loading: boolean;
	failed: boolean;
	source: Layer["source"] | null;
	methodNote: string | null;
}): MeasurementScience {
	const extras = {
		signNote: LOS_SIGN,
		reliefExaggeration: `×${input.reliefExaggeration}`,
		deformExaggeration: `×${input.deformExaggeration}`,
		synthetic: input.source === "synthetic",
		methodNote: input.methodNote,
		latest: input.series
			? latestSeriesReading(input.series, input.dates, input.dateIndex)
			: null,
	};
	if (!input.probe) {
		return {
			status: "empty",
			displacement: null,
			rate: null,
			window: dateRangeLabel(input.dates),
			col: null,
			row: null,
			lon: null,
			lat: null,
			cellSizeM: `${Math.round(input.cellSizeM)}\u00a0m`,
			groundM: null,
			...extras,
		};
	}
	const place = {
		col: input.probe.col.toFixed(1),
		row: input.probe.row.toFixed(1),
		lon: `${input.probe.lon.toFixed(4)}°`,
		lat: `${input.probe.lat.toFixed(4)}°`,
		cellSizeM: `${Math.round(input.cellSizeM)}\u00a0m`,
		groundM:
			input.groundM === null ? null : `${Math.round(input.groundM)}\u00a0m`,
		window: dateRangeLabel(input.dates),
	};
	if (input.failed) {
		return {
			status: "failed",
			displacement: null,
			rate: null,
			...place,
			...extras,
		};
	}
	if (input.loading) {
		return {
			status: "loading",
			displacement: null,
			rate: null,
			...place,
			...extras,
		};
	}
	const value = input.series?.[input.dateIndex] ?? null;
	const rate =
		input.rate === null ? null : formatMagnitude(input.rate, "cm/año");
	if (value === null) {
		return {
			status: "nodata",
			displacement: null,
			rate,
			...place,
			...extras,
		};
	}
	return {
		status: "ready",
		displacement: formatMagnitude(value, "cm"),
		rate,
		...place,
		...extras,
	};
}

export function impactBandNotes(): string[] {
	return [
		`Hundimiento alto: ${formatMagnitude(BAND_LIMITS.high, "cm")} o menos.`,
		`Hundimiento medio: ${formatMagnitude(BAND_LIMITS.mid, "cm")} o menos.`,
		`Hundimiento bajo: ${formatMagnitude(BAND_LIMITS.low, "cm")} o menos.`,
		`Zona más alta: ${formatMagnitude(BAND_LIMITS.up, "cm")} o más.`,
		"Umbrales en centímetros: 10, 5 y 2.",
	];
}

export function agriThresholdNotes(): string[] {
	return [
		`Vegetación: ${HV_DELTA_DB} dB de HV en al menos el ${Math.round(SIGNAL_SHARE * 100)} % de las celdas.`,
		`Zona mínima: ${MIN_ZONE_KM2} km².`,
		`Canal o río a menos de ${WATERWAY_MAX_M / 1000} km.`,
	];
}

export function agriZoneScience(zone: AgriZone): AgriScience {
	return {
		id: zone.id,
		label: `Zona ${zone.id + 1}`,
		areaKm2: `${zone.areaKm2.toFixed(2)}\u00a0km²`,
		cells: String(zone.cells.length),
		centroid: `${zone.col.toFixed(1)}, ${zone.row.toFixed(1)}`,
		coverClass: "Cultivos · ESA WorldCover 2021",
		thresholds: agriThresholdNotes(),
		limits: [AGRI_COPY.coverage, AGRI_COPY.noAdvice, AGRI_COPY.noCause],
	};
}

const peopleLabel = (people: number) =>
	`≈ ${Number(people.toPrecision(2))} personas`;

const zoneLine = (zone: ImpactZoneScience) =>
	[
		`${zone.rank}. ${zone.band}. Extremo: ${zone.displacement}. Área: ${zone.areaKm2}. ${zone.rate}.`,
		zone.place,
		zone.people,
		zone.landUse && `Principalmente ${zone.landUse.toLowerCase()}`,
	]
		.filter((part): part is string => Boolean(part))
		.join(" ");

export function impactZoneScience(
	zone: Pick<Zone, "band" | "valueCm" | "areaKm2" | "meanVelocity">,
	extras: {
		rank: number;
		date: string | null;
		people: number | null;
		landUse: string | null;
		place: string | null;
		synthetic: boolean;
	},
): ImpactZoneScience {
	return {
		rank: extras.rank,
		band: BAND_NAMES[zone.band as BandValue],
		displacement: formatMagnitude(zone.valueCm, "cm"),
		areaKm2: `${zone.areaKm2.toFixed(2)}\u00a0km²`,
		rate:
			zone.meanVelocity === null
				? ZONE_RATE_MISSING
				: formatMagnitude(zone.meanVelocity, "cm/año"),
		date: extras.date,
		people: extras.people === null ? null : peopleLabel(extras.people),
		landUse: extras.landUse,
		place: extras.place,
		synthetic: extras.synthetic,
		agriNote: IMPACT_AGRI_NOTE,
	};
}

export function impactZoneRankScience(input: {
	date: string | null;
	zones: ImpactZoneScience[];
	synthetic: boolean;
}): ImpactZoneRankScience {
	return {
		date: input.date,
		empty: input.zones.length === 0,
		lines:
			input.zones.length === 0
				? [
						`No hay zonas de hundimiento de al menos ${IMPACT_MIN_KM2} km² en esta fecha.`,
					]
				: [
						`Hay ${input.zones.length} ${input.zones.length === 1 ? "zona" : "zonas"} de hundimiento en esta fecha. Se listan hasta ${MAX_LABELED_ZONES}.`,
						`Cada zona mide al menos ${IMPACT_MIN_KM2} km².`,
						...input.zones.map(zoneLine),
					],
		agriNote: IMPACT_AGRI_NOTE,
		synthetic: input.synthetic,
	};
}

const foldQuestion = (question: string) =>
	question.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Pregunta por las zonas de hundimiento de todo el mapa, no por el punto. */
export function isZoneRankQuestion(question: string): boolean {
	const text = foldQuestion(question);
	return /\bzona/.test(text) && /(hundid|desplaz)/.test(text);
}

/** Texto que lee la persona: las mismas cifras del ranking, sin el modelo. */
export function impactZoneRankAnswer(rank: ImpactZoneRankScience): string {
	if (rank.empty) {
		return [rank.date && `Fecha: ${rank.date}.`, ...rank.lines, rank.agriNote]
			.filter((part): part is string => Boolean(part))
			.join(" ");
	}
	const listed = rank.lines.filter((line) => /^\d+\.\s/.test(line));
	const rest = rank.lines.filter((line) => !/^\d+\.\s/.test(line));
	const lead = rank.date
		? `En ${rank.date} estas son las zonas del mapa con más hundimiento, de más a menos:`
		: "Estas son las zonas del mapa con más hundimiento, de más a menos:";
	return [
		lead,
		...listed.map((line) => `- ${line.replace(/^\d+\.\s/, "")}`),
		...rest,
		rank.agriNote,
	]
		.filter((part): part is string => Boolean(part))
		.join("\n");
}
