/**
 * Vistas de impacto sobre el mapa (add-map-impact-views). Lógica pura a partir del cubo:
 * zonas por bandas, hundimiento diferencial y aceleración.
 */
import { type CubeInfo, robustLimit, velocityField } from "./stats";

export const Band = {
	NODATA: 0,
	NONE: 1,
	UP: 2,
	LOW: 3,
	MID: 4,
	HIGH: 5,
} as const;
export type BandValue = (typeof Band)[keyof typeof Band];

/** Colores por banda (índice = valor de banda); los comparten el shader y la leyenda. */
export const BAND_COLORS = [
	"#6f6a75",
	"#000000",
	"#2f8fd6",
	"#f2c14e",
	"#ee7b30",
	"#c81e1e",
];

export const BAND_NAMES: Record<BandValue, string> = {
	[Band.NODATA]: "Sin dato",
	[Band.NONE]: "Sin cambio",
	[Band.UP]: "Zona más alta",
	[Band.LOW]: "Hundimiento bajo",
	[Band.MID]: "Hundimiento medio",
	[Band.HIGH]: "Hundimiento alto",
};

export const MIN_ZONE_KM2 = 1;
export const MAX_LABELED_ZONES = 5;
export const MIN_DATES_ACCELERATION = 4;
export const BAND_LIMITS = {
	high: -10,
	mid: -5,
	low: -2,
	up: 2,
} as const;
const SMOOTH_RADIUS = 2;

export function classify(cm: number): BandValue {
	if (Number.isNaN(cm)) return Band.NODATA;
	if (cm <= BAND_LIMITS.high) return Band.HIGH;
	if (cm <= BAND_LIMITS.mid) return Band.MID;
	if (cm <= BAND_LIMITS.low) return Band.LOW;
	if (cm >= BAND_LIMITS.up) return Band.UP;
	return Band.NONE;
}

/** Promedio de caja que ignora NaN; los píxeles NaN siguen siendo NaN. */
export function boxSmooth(
	field: Float32Array,
	width: number,
	height: number,
	radius = SMOOTH_RADIUS,
): Float32Array {
	const sum = new Float32Array(field.length);
	const count = new Uint16Array(field.length);
	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			let s = 0;
			let n = 0;
			const lo = Math.max(0, i - radius);
			const hi = Math.min(width - 1, i + radius);
			for (let k = lo; k <= hi; k++) {
				const v = field[j * width + k];
				if (!Number.isNaN(v)) {
					s += v;
					n++;
				}
			}
			sum[j * width + i] = s;
			count[j * width + i] = n;
		}
	}
	const out = new Float32Array(field.length);
	for (let j = 0; j < height; j++) {
		const lo = Math.max(0, j - radius);
		const hi = Math.min(height - 1, j + radius);
		for (let i = 0; i < width; i++) {
			const p = j * width + i;
			if (Number.isNaN(field[p])) {
				out[p] = Number.NaN;
				continue;
			}
			let s = 0;
			let n = 0;
			for (let k = lo; k <= hi; k++) {
				s += sum[k * width + i];
				n += count[k * width + i];
			}
			out[p] = n > 0 ? s / n : Number.NaN;
		}
	}
	return out;
}

/** Plano de una fecha en cm (NaN = sin dato). */
export function datePlane(
	cube: Int16Array,
	info: CubeInfo,
	dateIndex: number,
): Float32Array {
	const plane = info.width * info.height;
	const t = Math.min(Math.max(dateIndex, 0), info.dates.length - 1);
	const out = new Float32Array(plane);
	for (let p = 0; p < plane; p++) {
		const raw = cube[t * plane + p];
		out[p] = raw === info.nodata ? Number.NaN : raw * info.scale;
	}
	return out;
}

export interface Zone {
	kind: "down" | "up";
	band: BandValue;
	areaKm2: number;
	/** Punto extremo, en coordenadas de grilla (centro de celda). */
	col: number;
	row: number;
	valueCm: number;
	meanVelocity: number | null;
	/** Índices de sus celdas, para cruzarla con población y uso de suelo. */
	cells: number[];
}

/** Hundimiento, del más bajo al menos bajo. El mapa sigue ordenando por área. */
export function rankedSubsidenceZones(
	zones: Zone[],
	cap = MAX_LABELED_ZONES,
): Zone[] {
	return zones
		.filter((zone) => zone.kind === "down")
		.sort((a, b) => a.valueCm - b.valueCm)
		.slice(0, cap);
}

/** Personas y uso de suelo predominante dentro de una zona. */
export function zoneContext(
	zone: Pick<Zone, "cells">,
	population: ArrayLike<number> | null,
	landcover: ArrayLike<number> | null,
	classNames: Record<number, string>,
): { people: number | null; landUse: string | null } {
	let people = 0;
	const counts = new Map<number, number>();
	for (const p of zone.cells) {
		const v = population?.[p] ?? 0;
		if (v > 0) people += v;
		const c = landcover?.[p] ?? 0;
		if (c > 1) counts.set(c, (counts.get(c) ?? 0) + 1);
	}
	let best = 0;
	let bestCount = 0;
	for (const [c, n] of counts) {
		if (n > bestCount) {
			best = c;
			bestCount = n;
		}
	}
	return {
		people: population && people >= 1 ? people : null,
		landUse: classNames[best] ?? null,
	};
}

export interface ZoneMap {
	bands: Uint8Array;
	/** De mayor a menor área. */
	zones: Zone[];
}

/**
 * Clasifica un plano suavizado en bandas y agrupa las áreas conexas (8 vecinos). Las de menos
 * de `MIN_ZONE_KM2` se consideran ruido y vuelven a "sin cambio".
 */
export function zoneMap(
	smoothed: Float32Array,
	width: number,
	height: number,
	velocity: Float32Array,
	cellSizeM: number,
): ZoneMap {
	const n = smoothed.length;
	const bands = new Uint8Array(n);
	for (let p = 0; p < n; p++) bands[p] = classify(smoothed[p]);

	const isDown = (b: number) => b >= Band.LOW;
	const seen = new Uint8Array(n);
	const stack = new Int32Array(n);
	const cellKm2 = (cellSizeM * cellSizeM) / 1e6;
	const zones: Zone[] = [];

	for (let start = 0; start < n; start++) {
		const b0 = bands[start];
		if (seen[start] || (b0 !== Band.UP && !isDown(b0))) continue;
		const down = isDown(b0);
		const members: number[] = [];
		let top = 0;
		stack[top++] = start;
		seen[start] = 1;
		while (top > 0) {
			const p = stack[--top];
			members.push(p);
			const i = p % width;
			const j = (p - i) / width;
			for (let dj = -1; dj <= 1; dj++) {
				for (let di = -1; di <= 1; di++) {
					const x = i + di;
					const y = j + dj;
					if (x < 0 || y < 0 || x >= width || y >= height) continue;
					const q = y * width + x;
					if (seen[q]) continue;
					const b = bands[q];
					if (down ? isDown(b) : b === Band.UP) {
						seen[q] = 1;
						stack[top++] = q;
					}
				}
			}
		}

		const areaKm2 = members.length * cellKm2;
		if (areaKm2 < MIN_ZONE_KM2) {
			for (const p of members) bands[p] = Band.NONE;
			continue;
		}
		let extreme = members[0];
		let vSum = 0;
		let vCount = 0;
		for (const p of members) {
			const better = down
				? smoothed[p] < smoothed[extreme]
				: smoothed[p] > smoothed[extreme];
			if (better) extreme = p;
			if (Number.isFinite(velocity[p])) {
				vSum += velocity[p];
				vCount++;
			}
		}
		zones.push({
			kind: down ? "down" : "up",
			band: bands[extreme] as BandValue,
			areaKm2,
			col: (extreme % width) + 0.5,
			row: Math.floor(extreme / width) + 0.5,
			valueCm: smoothed[extreme],
			meanVelocity: vCount > 0 ? vSum / vCount : null,
			cells: members,
		});
	}
	zones.sort((a, b) => b.areaKm2 - a.areaKm2);
	return { bands, zones };
}

/** Magnitud del gradiente en cm/km por diferencias centrales; NaN si falta un vecino. */
export function differentialField(
	smoothed: Float32Array,
	width: number,
	height: number,
	cellSizeM: number,
): Float32Array {
	const out = new Float32Array(smoothed.length).fill(Number.NaN);
	const span = (2 * cellSizeM) / 1000;
	for (let j = 1; j < height - 1; j++) {
		for (let i = 1; i < width - 1; i++) {
			const p = j * width + i;
			const dx = (smoothed[p + 1] - smoothed[p - 1]) / span;
			const dz = (smoothed[p + width] - smoothed[p - width]) / span;
			const g = Math.hypot(dx, dz);
			if (!Number.isNaN(smoothed[p]) && !Number.isNaN(g)) out[p] = g;
		}
	}
	return out;
}

/**
 * Velocidad de la segunda mitad de la serie menos la de la primera (cm/año). Negativo = el
 * hundimiento se aceleró; positivo = se frenó. null con menos de `MIN_DATES_ACCELERATION` fechas.
 */
export function accelerationField(
	cube: Int16Array,
	info: CubeInfo,
): Float32Array | null {
	const t = info.dates.length;
	if (t < MIN_DATES_ACCELERATION) return null;
	const plane = info.width * info.height;
	const mid = Math.floor((t - 1) / 2);
	const first = velocityField(cube.subarray(0, (mid + 1) * plane), {
		...info,
		dates: info.dates.slice(0, mid + 1),
	});
	const second = velocityField(cube.subarray(mid * plane), {
		...info,
		dates: info.dates.slice(mid),
	});
	const out = new Float32Array(plane);
	for (let p = 0; p < plane; p++) out[p] = second[p] - first[p];
	return boxSmooth(out, info.width, info.height);
}

export interface ImpactAnalysis {
	zones: (dateIndex: number) => ZoneMap;
	differential: (dateIndex: number) => Float32Array;
	/** Límite de color fijo (última fecha), para que la escala no salte al reproducir. */
	differentialLimit: () => number;
	acceleration: () => Float32Array | null;
	accelerationLimit: () => number;
}

/** Análisis perezoso y memorizado por fecha: la reproducción en bucle no recalcula. */
export function createImpactAnalysis(
	cube: Int16Array,
	info: CubeInfo,
	velocity: Float32Array,
	cellSizeM: number,
): ImpactAnalysis {
	const { width, height } = info;
	const smoothed = new Map<number, Float32Array>();
	const zones = new Map<number, ZoneMap>();
	const differential = new Map<number, Float32Array>();
	let diffLimit: number | null = null;
	let accel: Float32Array | null | undefined;
	let accelLimit: number | null = null;

	const smooth = (t: number) => {
		let s = smoothed.get(t);
		if (!s) {
			s = boxSmooth(datePlane(cube, info, t), width, height);
			smoothed.set(t, s);
		}
		return s;
	};
	const api: ImpactAnalysis = {
		zones(t) {
			let z = zones.get(t);
			if (!z) {
				z = zoneMap(smooth(t), width, height, velocity, cellSizeM);
				zones.set(t, z);
			}
			return z;
		},
		differential(t) {
			let d = differential.get(t);
			if (!d) {
				d = differentialField(smooth(t), width, height, cellSizeM);
				differential.set(t, d);
			}
			return d;
		},
		differentialLimit() {
			diffLimit ??= robustLimit(api.differential(info.dates.length - 1));
			return diffLimit;
		},
		acceleration() {
			if (accel === undefined) accel = accelerationField(cube, info);
			return accel;
		},
		accelerationLimit() {
			const a = api.acceleration();
			accelLimit ??= a ? robustLimit(a) : 1;
			return accelLimit;
		},
	};
	return api;
}

/** Frase de la sonda para las vistas que no son acumulado ni velocidad. */
export function zoneReading(band: number): string | null {
	if (band === Band.NODATA) return null;
	if (band === Band.NONE) return "Fuera de las zonas de cambio";
	if (band === Band.UP) return "Zona más alta";
	return `Zona de ${BAND_NAMES[band as BandValue].toLowerCase()}`;
}

export function differentialReading(value: number): string | null {
	return Number.isFinite(value)
		? `El terreno cambia ${value.toFixed(1)} cm por km aquí`
		: null;
}

export function accelerationReading(value: number): string | null {
	if (!Number.isFinite(value)) return null;
	const abs = Math.abs(value).toFixed(1);
	if (Math.abs(value) < 0.5) return "Ritmo sin cambio claro";
	return value < 0 ? `Se acelera ${abs} cm/año` : `Se frena ${abs} cm/año`;
}
