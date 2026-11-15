import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Panel } from "./Panel";

export type ScienceMenuId =
	| "medicion"
	| "capas"
	| "punto"
	| "cultivos"
	| "eventos"
	| "metodo"
	| "procedencia"
	| "escena";

export type ScienceMenuItem = {
	id: ScienceMenuId;
	label: string;
};

type ScienceMenuBarProps = {
	items: ScienceMenuItem[];
	openId: ScienceMenuId | null;
	onOpen: (id: ScienceMenuId | null) => void;
	panels: Partial<Record<ScienceMenuId, React.ReactNode>>;
	headingExtra?: Partial<Record<ScienceMenuId, string>>;
	trailing?: React.ReactNode;
};

const triggerClass = (expanded: boolean) =>
	`flex h-11 shrink-0 items-center rounded-xl border px-3 text-sm font-semibold whitespace-nowrap shadow-lg backdrop-blur-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 motion-safe:transition-[transform,color,background-color,border-color] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.2,0,0,1)] motion-safe:active:scale-[0.96] ${
		expanded
			? "border-white/10 bg-cyan-400 text-slate-950"
			: "border-white/10 bg-slate-950/75 text-slate-100 hover:border-cyan-300/50 hover:text-cyan-200"
	}`;

export const ScienceMenuBar = ({
	items,
	openId,
	onOpen,
	panels,
	headingExtra,
	trailing,
}: ScienceMenuBarProps) => {
	const triggers = useRef<Partial<Record<ScienceMenuId, HTMLButtonElement>>>(
		{},
	);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || openId === null) return;
			onOpen(null);
			triggers.current[openId]?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [openId, onOpen]);

	const openItem = items.find((item) => item.id === openId) ?? null;
	const extra = openId ? headingExtra?.[openId] : undefined;

	return (
		<div className="pointer-events-auto flex min-w-0 flex-col gap-2">
			<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
				<nav
					aria-label="Fichas científicas"
					className="mr-auto flex w-max max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					{items.map((item) => {
						const expanded = openId === item.id;
						return (
							<button
								key={item.id}
								type="button"
								ref={(node) => {
									if (node) triggers.current[item.id] = node;
									else delete triggers.current[item.id];
								}}
								aria-expanded={expanded}
								aria-controls={
									expanded ? `science-panel-${item.id}` : undefined
								}
								aria-label={`${item.label}, ${expanded ? "expandido" : "contraído"}`}
								onClick={() => onOpen(expanded ? null : item.id)}
								className={triggerClass(expanded)}
							>
								{item.label}
							</button>
						);
					})}
				</nav>
				{trailing}
			</div>
			{openItem && (
				<Panel
					id={`science-panel-${openItem.id}`}
					role="region"
					aria-labelledby={`science-heading-${openItem.id}`}
					className="science-sheet w-full max-w-[42rem] p-2 sm:w-[42rem]"
				>
					<div className="flex items-start justify-between gap-2 px-2 pt-1">
						<h2
							id={`science-heading-${openItem.id}`}
							className="min-w-0 text-pretty text-lg font-semibold leading-[1.1] text-white [text-wrap:balance]"
						>
							{openItem.label}
							{extra ? (
								<span className="mt-1 block font-normal text-slate-300 text-sm tabular-nums">
									{extra}
								</span>
							) : null}
						</h2>
						<button
							type="button"
							aria-label="Cerrar menú"
							onClick={() => {
								onOpen(null);
								triggers.current[openItem.id]?.focus();
							}}
							className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300 motion-safe:transition-[transform,color,background-color] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.2,0,0,1)] motion-safe:active:scale-[0.96] sm:size-10"
						>
							<X className="size-4 stroke-[2]" aria-hidden />
						</button>
					</div>
					<div className="mt-3 max-h-[min(52dvh,28rem)] overflow-y-auto overscroll-contain px-2 pb-6 text-base leading-[1.5] text-slate-200 [text-wrap:pretty]">
						<div className="rounded-lg">{panels[openItem.id]}</div>
					</div>
				</Panel>
			)}
		</div>
	);
};
