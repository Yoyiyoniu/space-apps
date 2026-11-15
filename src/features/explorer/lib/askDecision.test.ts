import { describe, expect, it, vi } from "vitest";
import {
	ASK_MAX_TOKENS,
	AskSchema,
	MISTRAL_LARGE_3_MODEL_ID,
	recordAnswer,
	runAsk,
} from "./askDecision";
import type { PacketRecord } from "./readingPacket";
import { ASSISTANT_COPY, SYNTHETIC_NOTE } from "./science";

const records: PacketRecord[] = [
	{
		id: "medicion",
		kind: "measurement",
		text: "Fecha: 2025-10-01.",
		synthetic: false,
		label: "Medición de este punto",
	},
];

const input = {
	question: "¿Qué fecha es?",
	records,
	history: [] as Array<{ role: "user" | "assistant"; text: string }>,
};

describe("AskSchema", () => {
	it("rechaza la pregunta vacía y un paquete por encima del tope", () => {
		expect(AskSchema.safeParse({ ...input, question: "   " }).success).toBe(
			false,
		);
		expect(
			AskSchema.safeParse({
				...input,
				records: Array.from({ length: 81 }, (_, index) => ({
					id: `r-${index}`,
					kind: "method",
					text: "sin cifra",
					synthetic: false,
				})),
			}).success,
		).toBe(false);
	});
});

describe("recordAnswer", () => {
	it("lista las zonas del registro sin llamar al modelo", async () => {
		const ranked: PacketRecord = {
			id: "zonas-desplazamiento",
			kind: "measurement",
			text: "En 2025-10-25 estas son las zonas.\n- Hundimiento alto. Extremo: -12.0 cm.",
			synthetic: true,
			label: "Zonas de hundimiento",
		};
		const invoke = vi.fn();
		const result = await runAsk(
			{
				question: "De todo el mapa, ¿cuáles zonas se han hundido más?",
				records: [ranked],
				history: [],
			},
			{},
			invoke,
		);
		expect(invoke).not.toHaveBeenCalled();
		expect(result.status).toBe("answer");
		expect(result.text).toContain("-12.0");
		expect(result.citations).toEqual(["zonas-desplazamiento"]);
		expect(
			recordAnswer({
				question: "¿Qué significan los colores?",
				records: [ranked],
				history: [],
			}),
		).toBeNull();
	});
});

describe("runAsk", () => {
	it("no llama a la red si falta la región", async () => {
		const invoke = vi.fn();
		const result = await runAsk(input, {}, invoke);
		expect(invoke).not.toHaveBeenCalled();
		expect(result).toEqual({
			status: "unavailable",
			text: ASSISTANT_COPY.unavailable,
			citations: [],
			sources: [],
		});
	});

	it("distingue credenciales, borrador, fallo y respuesta", async () => {
		const credentials = new Error("token");
		credentials.name = "CredentialsProviderError";
		const missingKey = await runAsk(input, { AWS_REGION: "us-east-1" }, () => {
			throw credentials;
		});
		expect(missingKey.status).toBe("unavailable");
		expect(missingKey.text).toBe(ASSISTANT_COPY.unavailable);

		const rejected = await runAsk(
			input,
			{ AWS_DEFAULT_REGION: "us-west-2" },
			async () =>
				JSON.stringify({ answer: "Bajó 99 cm.", citations: ["medicion"] }),
		);
		expect(rejected.status).toBe("unverified");
		expect(rejected.text).toBe(ASSISTANT_COPY.unverified);
		expect(rejected.text).not.toContain("99");

		const trimmed = await runAsk(input, { AWS_REGION: "us-east-1" }, async () =>
			JSON.stringify({
				answer: "La fecha es 2025-10-01. Bajó 99 cm.",
				citations: ["medicion"],
			}),
		);
		expect(trimmed.status).toBe("answer");
		expect(trimmed.text).toContain("2025-10-01");
		expect(trimmed.text).not.toContain("99");

		const failed = await runAsk(input, { AWS_REGION: "us-east-1" }, () => {
			throw new Error("bedrock");
		});
		expect(failed.status).toBe("failed");
		expect(failed.text).toBe(ASSISTANT_COPY.failed);

		const accepted = await runAsk(
			input,
			{ AWS_REGION: "us-east-1" },
			async (request) => {
				expect(request.modelId).toBe(MISTRAL_LARGE_3_MODEL_ID);
				expect(request.maxTokens).toBe(ASK_MAX_TOKENS);
				expect(request.region).toBe("us-east-1");
				expect(request.system).toContain("Valle de Mexicali");
				expect(request.system).toContain("Fecha: 2025-10-01.");
				return JSON.stringify({
					answer: "La fecha es 2025-10-01.",
					citations: ["medicion", "ajena"],
				});
			},
		);
		expect(accepted).toEqual({
			status: "answer",
			text: "La fecha es 2025-10-01.",
			citations: ["medicion"],
			sources: ["Medición de este punto"],
		});
	});

	it("añade la nota sintética cuando la cifra sí está y el modelo no la copió", async () => {
		const simulated: PacketRecord = {
			id: "sintetico",
			kind: "measurement",
			text: "Desplazamiento: -8.2 cm.",
			synthetic: true,
			label: "Hundimiento",
		};
		const result = await runAsk(
			{ question: "¿Cuánto bajó?", records: [simulated], history: [] },
			{ AWS_REGION: "us-east-1" },
			async () =>
				JSON.stringify({
					answer: "El desplazamiento es -8.2 cm.",
					citations: ["sintetico"],
				}),
		);
		expect(result.status).toBe("answer");
		expect(result.text).toContain("-8.2");
		expect(result.text).toContain(SYNTHETIC_NOTE);
	});

	it("acepta texto plano con la línea de fuente", async () => {
		const result = await runAsk(
			input,
			{ AWS_REGION: "us-east-1" },
			async () => "La fecha es 2025-10-01.\nFuente: medicion, ajena",
		);
		expect(result).toEqual({
			status: "answer",
			text: "La fecha es 2025-10-01.",
			citations: ["medicion"],
			sources: ["Medición de este punto"],
		});
	});
});
