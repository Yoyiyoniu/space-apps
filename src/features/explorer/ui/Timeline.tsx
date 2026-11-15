import { useEffect, useRef } from "react";
import { InfoHint } from "./InfoHint";

/** Paleta de UI: separa fechas, no es una capa de medición. */
const TIMELINE_COLORS = [
	"#f97316",
	"#2dd4bf",
	"#eab308",
	"#22d3ee",
	"#64748b",
] as const;

const MONTH = new Intl.DateTimeFormat("es-MX", {
	month: "short",
	timeZone: "UTC",
});

export type TimelineStop = {
	iso: string;
	month: string;
	year: string | null;
	color: string;
	stem: "up" | "down";
};

/** Una marca por pasada; el año solo en la primera fecha de ese año. */
export function timelineStops(dates: string[]): TimelineStop[] {
	let lastYear: string | null = null;
	return dates.map((iso, index) => {
		const at = new Date(`${iso}T12:00:00Z`);
		const year = Number.isNaN(at.getTime())
			? iso.slice(0, 4)
			: String(at.getUTCFullYear());
		const month = Number.isNaN(at.getTime())
			? iso
			: MONTH.format(at).replace(/\.$/, "");
		const showYear = year !== lastYear;
		lastYear = year;
		return {
			iso,
			month,
			year: showYear ? year : null,
			color: TIMELINE_COLORS[index % TIMELINE_COLORS.length],
			stem: index % 2 === 0 ? "down" : "up",
		};
	});
}

const fmtDate = (iso: string) =>
	new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});

type TimelineProps = {
	dates: string[];
	index: number;
	onSelect: (index: number) => void;
	note?: string;
};

const DatePick = ({
	stop,
	selected,
	onSelect,
}: {
	stop: TimelineStop;
	selected: boolean;
	onSelect: () => void;
}) => (
	<label className="relative z-10 cursor-pointer rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cyan-300">
		<input
			type="radio"
			name="timeline-date"
			value={stop.iso}
			checked={selected}
			aria-current={selected ? "date" : undefined}
			aria-label={fmtDate(stop.iso)}
			onChange={onSelect}
			className="sr-only"
		/>
		<span
			className={`flex size-11 items-center justify-center rounded-full border-2 font-semibold text-xs capitalize leading-none transition-[transform,background-color,color] sm:size-12 sm:text-sm ${
				selected ? "scale-110 text-slate-950" : "text-white hover:scale-105"
			}`}
			style={{
				borderColor: stop.color,
				backgroundColor: selected ? "#fff" : stop.color,
			}}
			aria-hidden
		>
			{stop.month}
		</span>
	</label>
);

export function Timeline({ dates, index, onSelect, note }: TimelineProps) {
	const stops = timelineStops(dates);
	const current = Math.min(Math.max(index, 0), Math.max(0, dates.length - 1));
	const scrollerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		window.scrollTo(0, 0);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: hay que centrar al cambiar de fecha
	useEffect(() => {
		const scroller = scrollerRef.current;
		const selected = scroller?.querySelector("input[type=radio]:checked");
		if (
			!(scroller instanceof HTMLElement) ||
			!(selected instanceof HTMLElement)
		)
			return;
		if (scroller.scrollWidth <= scroller.clientWidth) return;
		const mark = selected.closest("label") ?? selected;
		const scrollerBox = scroller.getBoundingClientRect();
		const markBox = mark.getBoundingClientRect();
		scroller.scrollTo({
			left:
				scroller.scrollLeft +
				(markBox.left - scrollerBox.left) -
				scroller.clientWidth / 2 +
				markBox.width / 2,
			behavior: "smooth",
		});
	}, [current]);

	return (
		<div className="pointer-events-auto w-full min-w-0">
			<div className="flex items-center justify-between gap-2 px-1">
				<span className="text-xs text-slate-300 tabular-nums">
					Fecha {current + 1} de {dates.length}
				</span>
				<InfoHint label="Línea de tiempo">
					<p>
						Cada punto es una pasada del satélite ({dates.length} fechas). Toca
						una fecha para ver esa medición.
					</p>
				</InfoHint>
			</div>
			<div
				ref={scrollerRef}
				className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
			>
				<div className="relative flex min-w-full items-stretch px-2">
					{stops.map((stop, i) => {
						const selected = i === current;
						const next = stops[i + 1];
						return (
							<div
								key={stop.iso}
								className="relative flex min-w-[3.5rem] flex-1 flex-col items-center"
							>
								<div className="flex h-[5.75rem] flex-col items-center justify-end gap-1">
									{stop.stem === "up" && (
										<>
											{stop.year && (
												<span
													className="font-bold text-xl leading-none tabular-nums sm:text-2xl"
													style={{ color: stop.color }}
												>
													{stop.year}
												</span>
											)}
											<DatePick
												stop={stop}
												selected={selected}
												onSelect={() => onSelect(i)}
											/>
											<span
												className="h-5 w-1 rounded-full"
												style={{ backgroundColor: stop.color }}
												aria-hidden
											/>
										</>
									)}
								</div>
								<div className="relative flex h-3 w-full items-center">
									{next && (
										<span
											className="absolute top-1/2 right-0 left-1/2 h-2.5 -translate-y-1/2 rounded-full"
											style={{ backgroundColor: stop.color }}
											aria-hidden
										/>
									)}
									{i > 0 && (
										<span
											className="absolute top-1/2 right-1/2 left-0 h-2.5 -translate-y-1/2 rounded-full"
											style={{ backgroundColor: stops[i - 1].color }}
											aria-hidden
										/>
									)}
									{i === 0 && (
										<span
											className="absolute top-1/2 right-1/2 left-0 h-2.5 -translate-y-1/2 rounded-full bg-slate-500"
											aria-hidden
										/>
									)}
									{!next && (
										<span
											className="absolute top-1/2 right-0 left-1/2 h-2.5 -translate-y-1/2 rounded-full bg-slate-500"
											aria-hidden
										/>
									)}
									<span
										className="relative z-10 size-2 rounded-full"
										style={{ backgroundColor: stop.color }}
										aria-hidden
									/>
								</div>
								<div className="flex h-[5.75rem] flex-col items-center justify-start gap-1">
									{stop.stem === "down" && (
										<>
											<span
												className="h-5 w-1 rounded-full"
												style={{ backgroundColor: stop.color }}
												aria-hidden
											/>
											<DatePick
												stop={stop}
												selected={selected}
												onSelect={() => onSelect(i)}
											/>
											{stop.year && (
												<span
													className="font-bold text-xl leading-none tabular-nums sm:text-2xl"
													style={{ color: stop.color }}
												>
													{stop.year}
												</span>
											)}
										</>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
			{note && (
				<p className="mt-1 px-1 text-[0.7rem] text-cyan-200/80">{note}</p>
			)}
		</div>
	);
}
