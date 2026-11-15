/** Arma el system prompt desde `assistant.md`. El markdown es el que se edita. */
import { AGRI_COPY } from "./agriculture";
import template from "./assistant.md?raw";
import type { PacketRecord } from "./readingPacket";
import { ASSISTANT_COPY, SYNTHETIC_NOTE } from "./science";

const SLOT = /\{\{(\w+)\}\}/g;
const COMMENT = /<!--[\s\S]*?-->/g;

export const fillAssistantPrompt = (
	source: string,
	slots: Record<string, string>,
) =>
	source
		.replace(COMMENT, "")
		.trim()
		.replace(SLOT, (_, name: string) => slots[name] ?? "");

export const systemPrompt = (records: PacketRecord[]) =>
	fillAssistantPrompt(template, {
		synthetic_note: SYNTHETIC_NOTE,
		recent: ASSISTANT_COPY.recent,
		coverage: AGRI_COPY.coverage,
		prompts: ASSISTANT_COPY.askPrompts
			.map((question) => `- ${question}`)
			.join("\n"),
		records: JSON.stringify(records),
	});
