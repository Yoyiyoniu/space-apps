/** Decide la respuesta sin llamar a la red. El handler de Bedrock solo la usa. */
import { z } from "zod";
import { AGRI_COPY } from "./agriculture";
import { answerCheck } from "./answerCheck";
import { systemPrompt } from "./assistantPrompt";
import { type PacketKind, sourceParts } from "./readingPacket";
import { ASSISTANT_COPY, SYNTHETIC_NOTE } from "./science";

export const MISTRAL_LARGE_3_MODEL_ID = "mistral.mistral-large-3-675b-instruct";
export const ASK_MAX_TOKENS = 1024;

const kinds = [
	"measurement",
	"method",
	"hypothesis",
	"illustrative",
	"event",
	"place",
] as const satisfies readonly PacketKind[];

const RecordSchema = z.object({
	id: z.string().min(1).max(80),
	kind: z.enum(kinds),
	text: z.string().max(2000),
	synthetic: z.boolean(),
	label: z.string().max(120).optional(),
});

const TurnSchema = z.object({
	role: z.enum(["user", "assistant"]),
	text: z.string().max(2000),
});

export const AskSchema = z.object({
	question: z.string().trim().min(1).max(500),
	records: z.array(RecordSchema).max(80),
	history: z.array(TurnSchema).max(6),
});

export type AskInput = z.infer<typeof AskSchema>;

export type AskEnv = {
	AWS_REGION?: string;
	AWS_DEFAULT_REGION?: string;
};

export type AskResult = {
	status: "answer" | "unverified" | "unavailable" | "failed";
	text: string;
	citations: string[];
	sources: string[];
};

export type ConverseRequest = {
	region: string;
	modelId: string;
	system: string;
	messages: Array<{ role: "user" | "assistant"; text: string }>;
	maxTokens: number;
};

const fixed = (
	status: Exclude<AskResult["status"], "answer">,
	text: string,
): AskResult => ({ status, text, citations: [], sources: [] });

export const regionOf = (env: AskEnv) => {
	const region = env.AWS_REGION || env.AWS_DEFAULT_REGION;
	return region ? region : null;
};

const credentialNames = new Set([
	"CredentialsProviderError",
	"ExpiredTokenException",
	"UnrecognizedClientException",
	"InvalidSignatureException",
]);

export const isCredentialsError = (error: unknown) => {
	if (!(error instanceof Error)) return false;
	if (credentialNames.has(error.name)) return true;
	return /could not load credentials|security token|credential/i.test(
		error.message,
	);
};

const SOURCE_LINE = /\nFuente:\s*([^\n]+)\s*$/i;

export const parseDraft = (
	raw: string,
): { answer: string; citations: string[] } => {
	const trimmed = raw
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
	try {
		const parsed = JSON.parse(trimmed) as {
			answer?: unknown;
			citations?: unknown;
		};
		const answer = typeof parsed.answer === "string" ? parsed.answer : "";
		const citations = Array.isArray(parsed.citations)
			? parsed.citations.filter(
					(item): item is string => typeof item === "string",
				)
			: [];
		if (answer) return { answer, citations };
	} catch {
		/* texto plano */
	}
	const match = trimmed.match(SOURCE_LINE);
	const citations = match?.[1]
		? match[1]
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
	const answer = match ? trimmed.slice(0, match.index).trim() : trimmed;
	return { answer, citations };
};

export type AskEvent =
	| { type: "delta"; text: string }
	| { type: "done"; result: AskResult };

const checkedAnswer = (input: AskInput, raw: string): AskResult => {
	const parsed = parseDraft(raw);
	if (!parsed.answer.trim()) return fixed("failed", ASSISTANT_COPY.failed);
	const verdict = answerCheck(input.records, parsed.answer);
	if (!verdict.ok && verdict.reason === "missing") {
		console.error("Cifra fuera del paquete", verdict.token);
		return fixed("unverified", ASSISTANT_COPY.unverified);
	}
	const known = new Set(input.records.map((record) => record.id));
	const citations = parsed.citations.filter((id) => known.has(id));
	let text = parsed.answer;
	if (!verdict.ok && verdict.reason === "label") {
		if (verdict.labels.includes("hypothesis")) text = `Hipótesis. ${text}`;
		if (verdict.labels.includes("synthetic"))
			text = `${text} ${SYNTHETIC_NOTE}`;
		if (verdict.labels.includes("crop")) text = `${text} ${AGRI_COPY.coverage}`;
	}
	return {
		status: "answer",
		text,
		citations,
		sources: sourceParts(input.records, citations),
	};
};

export async function* runAskStream(
	input: AskInput,
	env: AskEnv,
	invoke: (request: ConverseRequest) => AsyncIterable<string>,
): AsyncGenerator<AskEvent> {
	const region = regionOf(env);
	if (!region) {
		yield {
			type: "done",
			result: fixed("unavailable", ASSISTANT_COPY.unavailable),
		};
		return;
	}
	let raw = "";
	try {
		for await (const chunk of invoke({
			region,
			modelId: MISTRAL_LARGE_3_MODEL_ID,
			system: systemPrompt(input.records),
			messages: [...input.history, { role: "user", text: input.question }],
			maxTokens: ASK_MAX_TOKENS,
		})) {
			raw += chunk;
			yield { type: "delta", text: chunk };
		}
	} catch (error) {
		console.error("No se pudo consultar Bedrock", error);
		yield {
			type: "done",
			result: isCredentialsError(error)
				? fixed("unavailable", ASSISTANT_COPY.unavailable)
				: fixed("failed", ASSISTANT_COPY.failed),
		};
		return;
	}
	yield { type: "done", result: checkedAnswer(input, raw) };
}

export async function runAsk(
	input: AskInput,
	env: AskEnv,
	invoke: (request: ConverseRequest) => Promise<string>,
): Promise<AskResult> {
	let result: AskResult | null = null;
	for await (const event of runAskStream(input, env, async function* (request) {
		yield await invoke(request);
	})) {
		if (event.type === "done") result = event.result;
	}
	return result ?? fixed("failed", ASSISTANT_COPY.failed);
}
