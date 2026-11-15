/** Estado del hilo. No toca el mapa ni el borrador del modelo. */
export type ChatMessage = {
	id: number;
	role: "user" | "assistant";
	text: string;
	citations: string[];
	sources: string[];
};

export type ChatState = {
	expanded: boolean;
	pending: boolean;
	messages: ChatMessage[];
};

export type ChatAction =
	| { type: "toggle" }
	| { type: "submit"; question: string }
	| { type: "delta"; text: string }
	| { type: "result"; text: string; citations: string[]; sources: string[] };

export const initialChatState: ChatState = {
	expanded: true,
	pending: false,
	messages: [],
};

const lastAssistant = (messages: ChatMessage[]) => {
	const last = messages.at(-1);
	return last?.role === "assistant" ? last : null;
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
	if (action.type === "toggle") {
		return { ...state, expanded: !state.expanded };
	}
	if (action.type === "submit") {
		const question = action.question.trim();
		if (!question || state.pending) return state;
		const nextId = state.messages.length;
		return {
			expanded: true,
			pending: true,
			messages: [
				...state.messages,
				{
					id: nextId,
					role: "user",
					text: question,
					citations: [],
					sources: [],
				},
				{
					id: nextId + 1,
					role: "assistant",
					text: "",
					citations: [],
					sources: [],
				},
			],
		};
	}
	if (action.type === "delta") {
		const assistant = lastAssistant(state.messages);
		if (!state.pending || !assistant) return state;
		return {
			...state,
			messages: state.messages.map((message) =>
				message.id === assistant.id
					? { ...message, text: message.text + action.text }
					: message,
			),
		};
	}
	const assistant = lastAssistant(state.messages);
	if (!assistant) {
		return {
			...state,
			pending: false,
			expanded: true,
			messages: [
				...state.messages,
				{
					id: state.messages.length,
					role: "assistant",
					text: action.text,
					citations: action.citations,
					sources: action.sources,
				},
			],
		};
	}
	return {
		...state,
		pending: false,
		expanded: true,
		messages: state.messages.map((message) =>
			message.id === assistant.id
				? {
						...message,
						text: action.text,
						citations: action.citations,
						sources: action.sources,
					}
				: message,
		),
	};
}
