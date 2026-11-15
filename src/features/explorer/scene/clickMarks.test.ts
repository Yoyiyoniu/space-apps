import { expect, it } from "vitest";
import {
	type ClickMark,
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
	const first = pushClickMark(marks, 1, 10, 20);
	expect(marks).toEqual([]);
	expect(first).toEqual([{ id: 1, col: 10, row: 20 }]);

	const next = pushClickMark(first, 2, 30, 40);
	expect(first).toEqual([{ id: 1, col: 10, row: 20 }]);
	expect(next).toEqual([{ id: 2, col: 30, row: 40 }]);
});
