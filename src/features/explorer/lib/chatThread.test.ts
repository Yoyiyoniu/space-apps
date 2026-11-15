import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "./chatThread";
import { ASSISTANT_COPY } from "./science";

describe("chatReducer", () => {
	it("empieza abierto y ignora un envío mientras hay otro en curso", () => {
		expect(initialChatState.expanded).toBe(true);
		const pending = chatReducer(initialChatState, {
			type: "submit",
			question: "¿Cuánto se hundió?",
		});
		expect(pending.messages).toHaveLength(2);
		const ignored = chatReducer(pending, {
			type: "submit",
			question: "otra",
		});
		expect(ignored.messages).toEqual(pending.messages);
		expect(ignored.pending).toBe(true);
	});

	it("muestra la frase fija y no un borrador", () => {
		const pending = chatReducer(initialChatState, {
			type: "submit",
			question: "¿Cuánto?",
		});
		const shown = chatReducer(pending, {
			type: "result",
			text: ASSISTANT_COPY.unverified,
			citations: [],
			sources: [],
		});
		expect(shown.pending).toBe(false);
		expect(shown.messages[1]?.text).toBe(ASSISTANT_COPY.unverified);
		expect(shown.messages[1]?.text).not.toContain("99");
	});

	it("va pegando las letras y al final deja el texto comprobado", () => {
		const pending = chatReducer(initialChatState, {
			type: "submit",
			question: "¿Cuánto?",
		});
		const first = chatReducer(pending, { type: "delta", text: "El suelo" });
		const second = chatReducer(first, { type: "delta", text: " bajó." });
		expect(second.messages[1]?.text).toBe("El suelo bajó.");
		const shown = chatReducer(second, {
			type: "result",
			text: ASSISTANT_COPY.unverified,
			citations: [],
			sources: [],
		});
		expect(shown.messages[1]?.text).toBe(ASSISTANT_COPY.unverified);
	});
});
