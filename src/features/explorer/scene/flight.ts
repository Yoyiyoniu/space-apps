import { createContext, useContext } from "react";
import { HOVER_HEIGHT, MAP_SCALE } from "./terrainGeometry";

/**
 * Estado mutable del vuelo, leído y escrito cada cuadro dentro de `useFrame`.
 * Vive fuera de React/store para no re-renderizar a 60 Hz (design.md D9).
 */
export interface Flight {
	col: number;
	row: number;
	y: number;
	vx: number;
	vz: number;
	heading: number;
	bank: number;
	target: { col: number; row: number } | null;
	/** Último toque en el mapa, a la espera de que el terreno lo atienda. */
	tap: { col: number; row: number } | null;
	/** La cámara debe saltar (sin damping) a la nave en el próximo cuadro. */
	snap: boolean;
	width: number;
	height: number;
	/** Altura del terreno en unidades de escena. */
	heightAt: (col: number, row: number) => number;
}

export function createFlight(): Flight {
	return {
		col: 0,
		row: 0,
		y: 0,
		vx: 0,
		vz: 0,
		heading: 0,
		bank: 0,
		target: null,
		tap: null,
		snap: true,
		width: 1,
		height: 1,
		heightAt: () => 0,
	};
}

export const FlightContext = createContext<Flight | null>(null);

export function useFlight(): Flight {
	const flight = useContext(FlightContext);
	if (!flight) throw new Error("useFlight fuera de FlightContext");
	return flight;
}

/** Objetivo nuevo por clic: no arrastra inercia contraria al rumbo. */
export function aimAt(f: Flight, col: number, row: number) {
	const prev = f.target;
	f.target = { col, row };
	f.tap = { col, row };
	if (prev && (prev.col !== col || prev.row !== row)) {
		const ex = col - f.col;
		const ez = row - f.row;
		const dist = Math.hypot(ex, ez);
		if (dist > 0.2) {
			const nx = ex / dist;
			const nz = ez / dist;
			const along = f.vx * nx + f.vz * nz;
			if (along <= 0) {
				f.vx = 0;
				f.vz = 0;
			} else {
				f.vx = nx * along;
				f.vz = nz * along;
			}
		}
	}
}

/** Coloca la nave en un punto, en reposo, sobre el terreno. */
export function teleport(f: Flight, col: number, row: number) {
	f.col = col;
	f.row = row;
	f.vx = 0;
	f.vz = 0;
	f.target = null;
	f.y = f.heightAt(col, row) + HOVER_HEIGHT;
	f.snap = true;
}

export const MAX_SPEED = 38 / MAP_SCALE; // celdas/s
export const BOOST = 2;
export const ACCEL = 90 / MAP_SCALE;
export const FRICTION = 3.5;
export const EDGE_MARGIN = 1;

/** Un paso de integración del vuelo. `input` ya está en ejes de mundo (x, z). */
export function stepFlight(
	f: Flight,
	input: { dx: number; dz: number; boost: boolean },
	dt: number,
) {
	const max = MAX_SPEED * (input.boost ? BOOST : 1);
	const hasInput = input.dx !== 0 || input.dz !== 0;
	if (hasInput) {
		f.target = null;
		f.vx += input.dx * ACCEL * dt;
		f.vz += input.dz * ACCEL * dt;
	} else if (f.target) {
		// arrive steering: frena al acercarse al objetivo
		const ex = f.target.col - f.col;
		const ez = f.target.row - f.row;
		const dist = Math.hypot(ex, ez);
		if (dist < 0.4) {
			f.target = null;
		} else {
			const speed = Math.min(max * 1.4, dist * 2.2);
			const k = Math.min(1, dt * 5);
			f.vx += ((ex / dist) * speed - f.vx) * k;
			f.vz += ((ez / dist) * speed - f.vz) * k;
		}
	}
	if (!hasInput && !f.target) {
		const damp = Math.exp(-FRICTION * dt);
		f.vx *= damp;
		f.vz *= damp;
	}
	const speed = Math.hypot(f.vx, f.vz);
	const limit = f.target ? max * 1.4 : max;
	if (speed > limit) {
		f.vx *= limit / speed;
		f.vz *= limit / speed;
	}
	let col = f.col + f.vx * dt;
	let row = f.row + f.vz * dt;
	const lo = EDGE_MARGIN;
	if (col < lo || col > f.width - lo) {
		col = Math.min(Math.max(col, lo), f.width - lo);
		f.vx = 0;
	}
	if (row < lo || row > f.height - lo) {
		row = Math.min(Math.max(row, lo), f.height - lo);
		f.vz = 0;
	}
	f.col = col;
	f.row = row;
}
