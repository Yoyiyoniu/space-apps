import { createServerFn } from "@tanstack/react-start";
import {
	AskSchema,
	type ConverseRequest,
	runAsk,
	runAskStream,
} from "../lib/askDecision";

const converseInput = (request: ConverseRequest) => ({
	modelId: request.modelId,
	system: [{ text: request.system }],
	messages: request.messages.map((message) => ({
		role: message.role,
		content: [{ text: message.text }],
	})),
	inferenceConfig: {
		maxTokens: request.maxTokens,
		temperature: 0,
	},
});

const converse = async (request: ConverseRequest) => {
	const { BedrockRuntimeClient, ConverseCommand } = await import(
		"@aws-sdk/client-bedrock-runtime"
	);
	const client = new BedrockRuntimeClient({
		region: request.region,
		maxAttempts: 3,
	});
	const response = await client.send(
		new ConverseCommand(converseInput(request)),
	);
	for (const block of response.output?.message?.content ?? []) {
		if (block.text) return block.text;
	}
	return "";
};

export async function* converseChunks(
	request: ConverseRequest,
): AsyncIterable<string> {
	const { BedrockRuntimeClient, ConverseStreamCommand } = await import(
		"@aws-sdk/client-bedrock-runtime"
	);
	const client = new BedrockRuntimeClient({
		region: request.region,
		maxAttempts: 3,
	});
	const response = await client.send(
		new ConverseStreamCommand(converseInput(request)),
	);
	for await (const event of response.stream ?? []) {
		const text = event.contentBlockDelta?.delta?.text;
		if (text) yield text;
	}
}

export const askMeasurement = createServerFn({ method: "POST" })
	.validator((input: unknown) => AskSchema.parse(input))
	.handler(({ data }) => runAsk(data, process.env, converse));

export const streamAsk = (input: unknown) => {
	const data = AskSchema.parse(input);
	return runAskStream(data, process.env, converseChunks);
};
