import { createFileRoute } from "@tanstack/react-router";
import { ASSISTANT_COPY } from "../../features/explorer/lib/science";
import { streamAsk } from "../../features/explorer/server/ask";

export const Route = createFileRoute("/api/ask")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return Response.json(
						{ error: ASSISTANT_COPY.failed },
						{ status: 400 },
					);
				}
				const encoder = new TextEncoder();
				const stream = new ReadableStream({
					async start(controller) {
						const send = (event: unknown) => {
							controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
						};
						try {
							for await (const event of streamAsk(body)) {
								send(event);
							}
						} catch (error) {
							console.error("No se pudo producir la respuesta", error);
							send({
								type: "done",
								result: {
									status: "failed",
									text: ASSISTANT_COPY.failed,
									citations: [],
									sources: [],
								},
							});
						} finally {
							controller.close();
						}
					},
				});
				return new Response(stream, {
					headers: {
						"Content-Type": "application/x-ndjson; charset=utf-8",
						"Cache-Control": "no-store",
					},
				});
			},
		},
	},
});
