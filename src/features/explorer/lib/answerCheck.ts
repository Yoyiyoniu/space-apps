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

const dateParts = (date: string) => {
	const [year, month, day] = date.split("-");
	return [year, String(Number(month)), String(Number(day))];
};

const tokens = (text: string) => {
	const normalized = normalize(text).replace(/^\s*\d+[.)]\s+/gm, "");
	const dates = [...normalized.matchAll(DATE)].map((match) => match[0]);
	const rest = normalized.replace(DATE, " ");
	const numbers = [...rest.matchAll(NUMBER)].map((match) => match[0]);
	return [...dates, ...dates.flatMap(dateParts), ...numbers];
};

const sentences = (text: string) =>
	text
		.split(/\n+/)
		.flatMap((paragraph) => paragraph.split(/(?<=\.)\s+/))
		.map((piece) => piece.trim())
		.filter(Boolean);

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

/** Misma cantidad: -12 y -12.0, 9 y 9.00, coma o punto. No agrupa miles. */
const asNumber = (token: string) => {
	if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return null;
	if (token.includes(",") && token.includes(".")) return null;
	const value = Number(token.replace(",", "."));
	return Number.isFinite(value) ? value : null;
};

const sameNumber = (left: string, right: string) => {
	const a = asNumber(left);
	const b = asNumber(right);
	return a !== null && b !== null && Object.is(a, b);
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
	const packed = records.map((record) => ({
		record,
		parts: tokens(record.text),
	}));
	let synthetic = false;
	for (const token of claimed) {
		const hosts = packed.filter(
			(item) =>
				occurs(item.record.text, token) ||
				item.parts.some((part) => sameNumber(part, token)),
		);
		if (hosts.length === 0) return { ok: false, reason: "missing", token };
		if (hosts.every((item) => item.record.synthetic)) synthetic = true;
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

/** Quita frases con una cifra ausente; si no queda nada, null. */
export function keepGroundedSentences(
	records: PacketRecord[],
	draft: string,
): string | null {
	const kept = sentences(draft).filter((piece) => {
		const verdict = answerCheck(records, piece);
		return verdict.ok || (verdict.ok === false && verdict.reason === "label");
	});
	const text = kept.join(" ").trim();
	return text.length > 0 ? text : null;
}
