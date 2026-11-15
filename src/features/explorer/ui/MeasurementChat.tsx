import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ImpactEvent } from "../data/queries";
import {
	type ChatAction,
	chatReducer,
	initialChatState,
} from "../lib/chatThread";
import { TREND_LABELS, trendLevel } from "../lib/friendly";
import { sampleBilinear } from "../lib/grid";
import { CROP_VARIANTS } from "../lib/mapModels";
import { linearRate, readSeries } from "../lib/probe";
import { readingPacket } from "../lib/readingPacket";
import {
	type AgriScience,
	ASSISTANT_COPY,
	type CellScience,
	layerScience,
	measurementScience,
} from "../lib/science";
import type { Layer, Poi, Region } from "../manifest";
import { DEFAULT_EXAGGERATION } from "../scene/terrainGeometry";
import { explorerStore } from "../store";
import { METHOD_SECTIONS } from "./Overlays";
import { Panel } from "./Panel";

async function readAskStream(
	body: {
		question: string;
		records: ReturnType<typeof readingPacket>;
		history: Array<{ role: "user" | "assistant"; text: string }>;
	},
	dispatch: (action: ChatAction) => void,
) {
	try {
		const response = await fetch("/api/ask", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!response.ok || !response.body) {
			dispatch({
				type: "result",
				text: ASSISTANT_COPY.failed,
				citations: [],
				sources: [],
			});
			return;
		}
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		const handle = (line: string) => {
			if (!line.trim()) return;
			const event = JSON.parse(line) as {
				type?: string;
				text?: string;
				result?: { text: string; citations: string[]; sources?: string[] };
			};
			if (event.type === "delta" && event.text) {
				dispatch({ type: "delta", text: event.text });
			}
			if (event.type === "done" && event.result) {
				dispatch({
					type: "result",
					text: event.result.text,
					citations: event.result.citations,
					sources: event.result.sources ?? [],
				});
			}
		};
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) handle(line);
		}
		handle(buffer);
	} catch (error) {
		console.error("No se pudo enviar la pregunta", error);
		dispatch({
			type: "result",
			text: ASSISTANT_COPY.failed,
			citations: [],
			sources: [],
		});
	}
}

type MeasurementChatProps = {
	region: Region;
	timelineLayer: Layer | null;
	cube: Int16Array | undefined;
	cubePending: boolean;
	cubeFailed: boolean;
	dispIndex: number;
	terrain: Int16Array | undefined;
	source: Layer["source"] | null;
	cells: CellScience[];
	agriZone: AgriScience | null;
	events: ImpactEvent[];
	places: Poi[];
};

export const MeasurementChat = ({
	region,
	timelineLayer,
	cube,
	cubePending,
	cubeFailed,
	dispIndex,
	terrain,
	source,
	cells,
	agriZone,
	events,
	places,
}: MeasurementChatProps) => {
	const probe = useSelector(explorerStore, (state) => state.probe);
	const deformFactor = useSelector(
		explorerStore,
		(state) => state.deformFactor,
	);
	const [thread, dispatch] = useReducer(chatReducer, initialChatState);
	const [draft, setDraft] = useState("");
	const logRef = useRef<HTMLDivElement>(null);
	const records = useMemo(() => {
		const series =
			timelineLayer && cube && probe
				? readSeries(cube, region, timelineLayer, probe.col, probe.row)
				: null;
		const rate =
			series && timelineLayer ? linearRate(series, timelineLayer.dates) : null;
		return readingPacket({
			layers: region.layers.map(layerScience),
			measurement: measurementScience({
				probe,
				series,
				dateIndex: dispIndex,
				dates: timelineLayer?.dates ?? [],
				rate,
				cellSizeM: region.cellSizeM,
				groundM:
					probe && terrain
						? sampleBilinear(
								terrain,
								region.width,
								region.height,
								probe.col,
								probe.row,
							)
						: null,
				reliefExaggeration: DEFAULT_EXAGGERATION,
				deformExaggeration: deformFactor,
				loading: Boolean(timelineLayer) && cubePending,
				failed: Boolean(timelineLayer) && cubeFailed,
				source,
				methodNote: rate === null ? null : TREND_LABELS[trendLevel(rate)],
			}),
			cells,
			methods: METHOD_SECTIONS,
			agriZone,
			events,
			places,
			cropLabels: CROP_VARIANTS.map((variant) => variant.label),
		});
	}, [
		region,
		timelineLayer,
		cube,
		probe,
		dispIndex,
		terrain,
		deformFactor,
		cubePending,
		cubeFailed,
		source,
		cells,
		agriZone,
		events,
		places,
	]);

	useEffect(() => {
		const log = logRef.current;
		if (!log) return;
		const bottom = thread.messages.length + (thread.pending ? 1 : 0);
		if (bottom >= 0) log.scrollTop = log.scrollHeight;
	}, [thread.messages, thread.pending]);

	const send = (question: string) => {
		const trimmed = question.trim();
		if (!trimmed || thread.pending) return;
		const history = thread.messages
			.filter((message) => message.text.trim())
			.slice(-6)
			.map((message) => ({
				role: message.role,
				text: message.text,
			}));
		dispatch({ type: "submit", question: trimmed });
		setDraft("");
		void readAskStream({ question: trimmed, records, history }, dispatch);
	};

	return (
		<Panel
			aria-label="Conversación sobre las mediciones"
			className="flex h-full min-h-0 w-[min(24rem,42vw)] min-w-64 shrink-0 flex-col overflow-hidden"
		>
			<div
				ref={logRef}
				role="log"
				aria-live="polite"
				aria-relevant="additions"
				aria-busy={thread.pending}
				className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3 text-sm leading-relaxed"
			>
				{thread.messages.map((message) => (
					<div
						key={message.id}
						className={
							message.role === "user"
								? "ml-8 rounded-2xl rounded-br-md bg-cyan-400/15 px-3 py-2 text-slate-50"
								: "mr-8 rounded-2xl rounded-bl-md bg-white/10 px-3 py-2 text-slate-200"
						}
					>
						<p className="whitespace-pre-wrap">
							{message.text ||
								(thread.pending &&
								message.role === "assistant" &&
								message.id === thread.messages.at(-1)?.id
									? ASSISTANT_COPY.pending
									: "")}
							{thread.pending &&
								message.role === "assistant" &&
								message.id === thread.messages.at(-1)?.id && (
									<span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-cyan-300 align-[-2px]" />
								)}
						</p>
						{message.sources.length > 0 && (
							<footer className="mt-2 border-t border-white/10 pt-1.5 text-xs leading-snug text-slate-400">
								{ASSISTANT_COPY.takenFrom} {message.sources.join(" · ")}
							</footer>
						)}
					</div>
				))}
			</div>
			<form
				className="flex gap-2 border-t border-white/10 p-2"
				onSubmit={(event) => {
					event.preventDefault();
					send(draft);
				}}
			>
				<input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Pregunta lo que quieras sobre este valle"
					aria-label="Pregunta sobre el valle y las mediciones"
					maxLength={500}
					className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-cyan-300"
				/>
				<button
					type="submit"
					disabled={thread.pending || draft.trim().length === 0}
					className="inline-flex h-11 shrink-0 items-center rounded-xl bg-cyan-400 px-3 text-sm font-semibold text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-50"
				>
					Preguntar
				</button>
			</form>
		</Panel>
	);
};
