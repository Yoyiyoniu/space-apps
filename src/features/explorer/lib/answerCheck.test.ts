import { describe, expect, it } from "vitest";
import { METHOD_SECTIONS } from "../ui/Overlays";
import { AGRI_COPY } from "./agriculture";
import { answerCheck, keepGroundedSentences } from "./answerCheck";
import type { PacketRecord } from "./readingPacket";
import { SYNTHETIC_NOTE } from "./science";

const displacement = "-8.2\u00a0cm";

const measured: PacketRecord = {
	id: "medicion",
	kind: "measurement",
	text: `Desplazamiento: ${displacement}`,
	synthetic: false,
};

const simulated: PacketRecord = {
	id: "sintetico",
	kind: "measurement",
	text: `Desplazamiento: ${displacement}\n${SYNTHETIC_NOTE}`,
	synthetic: true,
};

const hypothesisBody =
	METHOD_SECTIONS.find((section) => section.id === "cerro-prieto")?.body[0] ??
	"";

const hypothesis: PacketRecord = {
	id: "cerro-prieto-0",
	kind: "hypothesis",
	text: `Hipótesis: por qué se hunde Cerro Prieto\n${hypothesisBody}`,
	synthetic: false,
};

describe("answerCheck", () => {
	it("acepta un desplazamiento copiado y rechaza un centímetro ausente", () => {
		expect(
			answerCheck([measured], `El desplazamiento es ${displacement}.`).ok,
		).toBe(true);
		expect(answerCheck([measured], "El suelo bajó 99 cm.").ok).toBe(false);
	});

	it("exige la nota sintética, la cobertura, la hipótesis y el paquete", () => {
		expect(answerCheck([simulated], `El valor es ${displacement}.`).ok).toBe(
			false,
		);
		expect(
			answerCheck([simulated], `El valor es ${displacement}. ${SYNTHETIC_NOTE}`)
				.ok,
		).toBe(true);
		const coverage: PacketRecord = {
			id: "agri-coverage",
			kind: "method",
			text: AGRI_COPY.coverage,
			synthetic: false,
		};
		expect(answerCheck([measured], "En esa parcela hay Trigo.").ok).toBe(false);
		expect(
			answerCheck(
				[measured, coverage],
				`En esa parcela hay Trigo. ${AGRI_COPY.coverage}`,
			).ok,
		).toBe(true);
		const sentence = hypothesisBody.split(/(?<=\.)\s+/)[0]?.trim() ?? "";
		expect(sentence.length).toBeGreaterThan(40);
		expect(answerCheck([hypothesis], sentence).ok).toBe(false);
		expect(answerCheck([hypothesis], `Hipótesis. ${sentence}`).ok).toBe(true);
		const previous = "14 cm";
		expect(answerCheck([measured], previous).ok).toBe(false);
	});

	it("acepta el decimal con coma y no cuenta el número de una lista", () => {
		expect(answerCheck([measured], "1. El desplazamiento es -8,2 cm.").ok).toBe(
			true,
		);
	});

	it("acepta el mismo centímetro sin el cero decimal", () => {
		const zone: PacketRecord = {
			id: "zonas-desplazamiento",
			kind: "measurement",
			text: "Hay 3 zonas. Extremo: -12.0 cm. Área: 9.00 km².",
			synthetic: false,
		};
		expect(answerCheck([zone], "La zona más hundida bajó -12 cm.").ok).toBe(
			true,
		);
		expect(answerCheck([zone], "El área es 9 km².").ok).toBe(true);
		expect(answerCheck([zone], "Hay 3 zonas de hundimiento.").ok).toBe(true);
		expect(answerCheck([zone], "El extremo es -11 cm.").ok).toBe(false);
	});

	it("acepta el día y el mes de una fecha del paquete", () => {
		const dated: PacketRecord = {
			id: "zonas-desplazamiento",
			kind: "measurement",
			text: "Fecha: 2025-10-25.\nExtremo: -12.0 cm.",
			synthetic: false,
		};
		expect(
			answerCheck([dated], "El 25 de octubre de 2025 bajó -12 cm.").ok,
		).toBe(true);
	});

	it("deja las frases ancladas y suelta la cifra inventada", () => {
		const dated: PacketRecord = {
			id: "zonas-desplazamiento",
			kind: "measurement",
			text: "Fecha: 2025-10-25. Extremo: -12.0 cm.",
			synthetic: false,
		};
		expect(
			keepGroundedSentences(
				[dated],
				"El 25 de octubre bajó -12 cm. En total fueron 99 cm.",
			),
		).toBe("El 25 de octubre bajó -12 cm.");
		expect(keepGroundedSentences([dated], "Bajó 99 cm.")).toBeNull();
	});
});
