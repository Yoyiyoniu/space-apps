/** Rechaza un borrador cuyas cifras no están en el paquete. */
import { AGRI_COPY } from "./agriculture";
import { CROP_VARIANTS } from "./mapModels";
import type { PacketRecord } from "./readingPacket";
import { SYNTHETIC_NOTE } from "./science";

const DATE = /\d{4}-\d{2}-\d{2}/g;
const NUMBER = /[+-]?\d+(?:[.,]\d+)?/g;

const normalize = (text: string) =>
	text.replace(/[\u00a0\u202f]/g, " ").replace(/\u2212/g, "-");

const escapeRegExp = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokens = (text: string) => {
	const normalized = normalize(text).replace(/^\s*\d+[.)]\s+/gm, "");
	const dates = [...normalized.matchAll(DATE)].map((match) => match[0]);
	const rest = normalized.replace(DATE, " ");
	const numbers = [...rest.matchAll(NUMBER)].map((match) => match[0]);
	return [...dates, ...numbers];
};

const forms = (token: string) => {
	const swapped = token.includes(",")
		? token.replace(/,/g, ".")
		: token.replace(/\./g, ",");
	return swapped === token ? [token] : [token, swapped];
};

const occurs = (haystack: string, token: string) => {
	const normalized = normalize(haystack);
	return forms(token).some((form) =>
		new RegExp(`(?<![\\d.,+-])${escapeRegExp(form)}(?!\\d)(?![.,]\\d)`).test(
			normalized,
		),
	);
};

export type AnswerLabel = "synthetic" | "crop" | "hypothesis";

export type AnswerVerdict =
	| { ok: true }
	| { ok: false; reason: "missing"; token: string }
	| { ok: false; reason: "label"; labels: AnswerLabel[] };

const hypothesisSentences = (text: string) =>
	normalize(text)
		.split(/\n+/)
		.flatMap((paragraph) => paragraph.split(/(?<=\.)\s+/))
		.map((sentence) => sentence.trim())
		.filter(
			(sentence) => sentence.length >= 40 && !/hip[oó]tesis/i.test(sentence),
		);

export function answerCheck(
	records: PacketRecord[],
	draft: string,
): AnswerVerdict {
	const claimed = tokens(draft);
	let synthetic = false;
	for (const token of claimed) {
		const hosts = records.filter((record) => occurs(record.text, token));
		if (hosts.length === 0) return { ok: false, reason: "missing", token };
		if (hosts.every((record) => record.synthetic)) synthetic = true;
	}
	const labels: AnswerLabel[] = [];
	if (synthetic && !draft.includes(SYNTHETIC_NOTE)) labels.push("synthetic");
	for (const variant of CROP_VARIANTS) {
		const named = new RegExp(
			`(?<![\\p{L}\\p{N}])${escapeRegExp(variant.label)}(?![\\p{L}\\p{N}])`,
			"u",
		);
		if (named.test(draft) && !draft.includes(AGRI_COPY.coverage)) {
			labels.push("crop");
			break;
		}
	}
	if (!/hip[oó]tesis/i.test(draft)) {
		const body = records
			.filter((record) => record.kind === "hypothesis")
			.flatMap((record) => hypothesisSentences(record.text));
		const normalized = normalize(draft);
		if (body.some((sentence) => normalized.includes(sentence))) {
			labels.push("hypothesis");
		}
	}
	if (labels.length === 0) return { ok: true };
	return { ok: false, reason: "label", labels };
}
