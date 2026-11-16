/** Serie y comparaciones en el punto de la sonda. Lógica pura. */
import { PACKET_TEXT_MAX } from "./readingPacket";
import { formatMagnitude } from "./science";

export type ProbePoint = { date: string; value: number; index: number };

const monthLabel = (iso: string) =>
	new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

const trendNote = (delta: number) => {
	if (delta === 0) return "sin cambio";
	if (delta < 0) return "más hundimiento en el segundo momento";
	return "menos hundimiento o acercamiento al satélite";
};

const diffMagnitude = (delta: number) => formatMagnitude(delta, "cm");

const stepLine = (from: ProbePoint, to: ProbePoint) =>
	`${from.date} → ${to.date}: diferencia ${diffMagnitude(to.value - from.value)} (${trendNote(to.value - from.value)})`;

/** Pares fecha–valor con dato en la celda. */
export function probePoints(
	series: Array<number | null>,
	dates: string[],
): ProbePoint[] {
	if (series.length === 0 || dates.length !== series.length) return [];
	const points: ProbePoint[] = [];
	series.forEach((value, index) => {
		const date = dates[index];
		if (value !== null && date) points.push({ date, value, index });
	});
	return points;
}

/** Lectura en o antes del índice activo. */
export function activeProbePoint(
	points: ProbePoint[],
	dateIndex: number,
): ProbePoint | null {
	if (points.length === 0) return null;
	const clamped = Math.min(Math.max(dateIndex, 0), points.at(-1)?.index ?? 0);
	const exact = points.find((point) => point.index === clamped);
	if (exact) return exact;
	return points.filter((point) => point.index <= clamped).at(-1) ?? null;
}

/**
 * Texto para el paquete del chat: serie, saltos entre fechas y comparaciones por mes.
 * null sin lecturas en la celda.
 */
export function probeTemporalText(
	series: Array<number | null>,
	dates: string[],
	dateIndex: number,
): string | null {
	const points = probePoints(series, dates);
	if (points.length === 0) return null;

	const lines: string[] = [
		"Serie de desplazamiento en este punto:",
		...points.map(
			(point) => `${point.date}: ${formatMagnitude(point.value, "cm")}`,
		),
	];

	if (points.length >= 2) {
		lines.push("", "Comparaciones entre fechas consecutivas con dato:");
		for (let index = 1; index < points.length; index++) {
			lines.push(stepLine(points[index - 1], points[index]));
		}
	}

	const active = activeProbePoint(points, dateIndex);
	if (active) {
		lines.push(
			"",
			`Comparaciones con la fecha activa (${active.date}, ${formatMagnitude(active.value, "cm")}):`,
		);
		const first = points[0];
		if (first.date !== active.date) {
			lines.push(stepLine(first, active));
		}
		const previous = points.filter((point) => point.index < active.index).at(-1);
		if (previous && previous.date !== active.date) {
			lines.push(
				`Respecto a la medición anterior (${previous.date}, ${formatMagnitude(previous.value, "cm")}): diferencia ${diffMagnitude(active.value - previous.value)}`,
			);
		}
	}

	const byMonth = new Map<string, ProbePoint>();
	for (const point of points) {
		byMonth.set(point.date.slice(0, 7), point);
	}
	const months = [...byMonth.entries()].sort(([left], [right]) =>
		left.localeCompare(right),
	);
	if (months.length >= 2) {
		lines.push(
			"",
			"Comparación aproximada entre meses (una lectura por mes en la serie):",
		);
		for (let index = 1; index < months.length; index++) {
			const [, from] = months[index - 1];
			const [, to] = months[index];
			lines.push(
				`${monthLabel(from.date)} (${from.date}) → ${monthLabel(to.date)} (${to.date}): diferencia ${diffMagnitude(to.value - from.value)}`,
			);
		}
	}

	const text = lines.join("\n");
	return text.length <= PACKET_TEXT_MAX ? text : text.slice(0, PACKET_TEXT_MAX);
}