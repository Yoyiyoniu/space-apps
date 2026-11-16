import { expect, it } from "vitest";
import {
	type ClickMark,
	expireClickMarks,
	MARK_HOLD_S,
	PULSE_DURATION_S,
	PULSE_SCALE_FROM,
	PULSE_SCALE_TO,
	pulseFrame,
	pushClickMark,
} from "./clickMarks";

it("el pulso nace cerrado y se abre hasta apagarse", () => {
	expect(pulseFrame(0)).toEqual({ scale: PULSE_SCALE_FROM, opacity: 1 });
	const mid = pulseFrame(PULSE_DURATION_S / 2);
	expect(mid?.opacity).toBeCloseTo(0.5);
	expect(mid?.scale).toBeCloseTo((PULSE_SCALE_FROM + PULSE_SCALE_TO) / 2);
	expect(pulseFrame(PULSE_DURATION_S)).toBeNull();
	expect(pulseFrame(-0.1)).toBeNull();
});

it("cada clic deja una sola cruz y borra la anterior", () => {
	const marks: ClickMark[] = [];
	const first = pushClickMark(marks, 1, 10, 20, 1_000);
	expect(marks).toEqual([]);
	expect(first).toEqual([{ id: 1, col: 10, row: 20, born: 1_000 }]);

	const next = pushClickMark(first, 2, 30, 40, 2_000);
	expect(first).toEqual([{ id: 1, col: 10, row: 20, born: 1_000 }]);
	expect(next).toEqual([{ id: 2, col: 30, row: 40, born: 2_000 }]);
});

it("la cruz sigue hasta los 3 segundos y luego desaparece", () => {
	const marks = pushClickMark([], 1, 4, 5, 10_000);
	expect(expireClickMarks(marks, 10_000 + MARK_HOLD_S * 1000 - 1)).toEqual(
		marks,
	);
	expect(expireClickMarks(marks, 10_000 + MARK_HOLD_S * 1000)).toEqual([]);
});