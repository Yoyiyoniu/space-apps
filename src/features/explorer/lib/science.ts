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
} as const;
export const LOS_SIGN = "Negativo: el suelo se aleja del satélite.";
export const RELIEF_NOTE =
	"Ilustrativa. El dato real es el color y los centímetros.";

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
