import { useSelector } from "@tanstack/react-store";
import { MessageSquare } from "lucide-react";
import { useMemo, useReducer, useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "#/components/ai-elements/conversation";
import { Message, MessageContent } from "#/components/ai-elements/message";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
} from "#/components/ai-elements/prompt-input";
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
	type ImpactZoneRankScience,
	type ImpactZoneScience,
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
	motionZones: ImpactZoneScience[];
	motionRank: ImpactZoneRankScience | null;
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
	motionZones,
	motionRank,
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
			motionZones,
			motionRank,
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
		motionZones,
		motionRank,
		events,
		places,
	]);

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

	const lastId = thread.messages.at(-1)?.id;
	const onSubmit = (message: PromptInputMessage) => {
		send(message.text);
	};

	return (
		<Panel
			aria-label="Conversación sobre las mediciones"
			className="flex h-full min-h-0 w-[min(24rem,42vw)] min-w-64 shrink-0 flex-col overflow-hidden"
		>
			<Conversation
				aria-live="polite"
				aria-relevant="additions"
				aria-busy={thread.pending}
				className="min-h-0"
			>
				<ConversationContent className="gap-3 p-3 text-sm leading-relaxed">
					{thread.messages.length === 0 ? (
						<ConversationEmptyState className="p-4">
							<MessageSquare className="size-8 text-muted-foreground" />
							<div className="space-y-1">
								<h3 className="font-medium text-sm">
									{ASSISTANT_COPY.askTitle}
								</h3>
								<p className="text-muted-foreground text-sm">
									{ASSISTANT_COPY.askDescription}
								</p>
							</div>
							<ul className="flex w-full flex-col gap-1.5 text-left">
								{ASSISTANT_COPY.askPrompts.map((question) => (
									<li key={question}>
										<button
											className="w-full rounded-md border border-white/10 bg-slate-950/40 px-2.5 py-1.5 text-left text-xs leading-snug text-slate-200 transition-colors hover:bg-slate-800"
											onClick={() => send(question)}
											type="button"
										>
											{question}
										</button>
									</li>
								))}
							</ul>
						</ConversationEmptyState>
					) : (
						thread.messages.map((message) => {
							const waiting =
								thread.pending &&
								message.role === "assistant" &&
								message.id === lastId;
							return (
								<Message from={message.role} key={message.id}>
									<MessageContent>
										<p className="whitespace-pre-wrap">
											{message.text || (waiting ? ASSISTANT_COPY.pending : "")}
											{waiting && (
												<span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-cyan-300 align-[-2px]" />
											)}
										</p>
										{message.sources.length > 0 && (
											<footer className="mt-2 border-t border-white/10 pt-1.5 text-xs leading-snug text-slate-400">
												{ASSISTANT_COPY.takenFrom} {message.sources.join(" · ")}
											</footer>
										)}
									</MessageContent>
								</Message>
							);
						})
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>
			<PromptInput className="p-2" onSubmit={onSubmit}>
				<PromptInputBody>
					<PromptInputTextarea
						aria-label={ASSISTANT_COPY.askPlaceholder}
						maxLength={500}
						onChange={(event) => setDraft(event.currentTarget.value)}
						placeholder={ASSISTANT_COPY.askPlaceholder}
						value={draft}
					/>
				</PromptInputBody>
				<PromptInputFooter className="justify-end">
					<PromptInputSubmit
						disabled={thread.pending || draft.trim().length === 0}
						status={thread.pending ? "streaming" : "ready"}
					/>
				</PromptInputFooter>
			</PromptInput>
		</Panel>
	);
};
