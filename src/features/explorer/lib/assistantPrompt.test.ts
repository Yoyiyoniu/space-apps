import { describe, expect, it } from "vitest";
import { AGRI_COPY } from "./agriculture";
import { fillAssistantPrompt, systemPrompt } from "./assistantPrompt";
import { ASSISTANT_COPY, SYNTHETIC_NOTE } from "./science";

describe("assistantPrompt", () => {
	it("rellena huecos y quita las notas de edición", () => {
		const filled = fillAssistantPrompt(
			"<!-- no -->\nHola {{recent}}.\n{{records}}",
			{ recent: "ventana", records: "[1]" },
		);
		expect(filled).toBe("Hola ventana.\n[1]");
		expect(filled).not.toContain("no");
	});

	it("carga el markdown con las reglas de expresión y el paquete", () => {
		const prompt = systemPrompt([
			{
				id: "medicion",
				kind: "measurement",
				text: "Fecha: 2025-10-01.",
				synthetic: false,
			},
		]);
		expect(prompt).toContain("Valle de Mexicali");
		expect(prompt).toContain("ayudante");
		expect(prompt).toContain("Frases cortas");
		expect(prompt).toContain(SYNTHETIC_NOTE);
		expect(prompt).toContain(ASSISTANT_COPY.recent);
		expect(prompt).toContain(AGRI_COPY.coverage);
		expect(prompt).toContain('"id":"medicion"');
		expect(prompt).not.toContain("{{records}}");
		expect(prompt).not.toContain("Huecos:");
	});
});
