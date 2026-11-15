import { describe, expect, it } from "vitest";
import { timelineStops } from "./Timeline";

const DATES = [
	"2025-10-01",
	"2025-10-25",
	"2025-11-18",
	"2026-01-05",
	"2026-10-20",
];

describe("timelineStops", () => {
	it("marca cada fecha y el año solo en la primera de ese año", () => {
		const stops = timelineStops(DATES);
		expect(stops).toHaveLength(5);
		expect(stops.map((stop) => stop.year)).toEqual([
			"2025",
			null,
			null,
			"2026",
			null,
		]);
		expect(stops[0].month).toBe("oct");
		expect(stops[2].month).toBe("nov");
		expect(stops[3].month).toBe("ene");
	});

	it("alterna palitos y recorre la paleta", () => {
		const stops = timelineStops(DATES);
		expect(stops.map((stop) => stop.stem)).toEqual([
			"down",
			"up",
			"down",
			"up",
			"down",
		]);
		expect(new Set(stops.map((stop) => stop.color)).size).toBeGreaterThan(1);
	});
});
