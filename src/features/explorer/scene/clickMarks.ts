/** Marca visual de un clic. No es una medición. */
export interface ClickMark {
	id: number;
	col: number;
	row: number;
}

export const PULSE_DURATION_S = 0.4;
export const PULSE_SCALE_FROM = 0.35;
export const PULSE_SCALE_TO = 8;

/** Escala y opacidad del anillo. `null` cuando el pulso ya terminó. */
export function pulseFrame(
	ageS: number,
): { scale: number; opacity: number } | null {
	if (!(ageS >= 0) || ageS >= PULSE_DURATION_S) return null;
	const t = ageS / PULSE_DURATION_S;
	return {
		scale: PULSE_SCALE_FROM + (PULSE_SCALE_TO - PULSE_SCALE_FROM) * t,
		opacity: 1 - t,
	};
}

/** La cruz nueva sustituye a la anterior. No muta la lista que recibe. */
export function pushClickMark(
	_marks: readonly ClickMark[],
	id: number,
	col: number,
	row: number,
): ClickMark[] {
	return [{ id, col, row }];
}
