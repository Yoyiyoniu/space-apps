import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DATA_BASE, manifestQuery } from "#/features/explorer/data/queries";
import type { Manifest } from "#/features/explorer/manifest";

export const Route = createFileRoute("/data")({
	ssr: false,
	component: DataCatalogPage,
	head: () => ({
		meta: [
			{
				title: "Datos · Valle de Mexicali",
			},
		],
	}),
});

type FileRow = {
	href: string;
	download: string;
	label: string;
	detail: string;
};

function filesFromManifest(manifest: Manifest): FileRow[] {
	const rows: FileRow[] = [
		{
			href: `${DATA_BASE}/manifest.json`,
			download: "manifest.json",
			label: "Manifiesto",
			detail: "Contrato: grilla, fechas, unidades y créditos",
		},
	];
	for (const region of manifest.regions) {
		rows.push({
			href: `${DATA_BASE}/${region.terrain.path}`,
			download: region.terrain.path.replaceAll("/", "-"),
			label: `Relieve · ${region.name}`,
			detail: `${region.width} × ${region.height} · Int16 LE · ${region.terrain.units}`,
		});
		for (const layer of region.layers) {
			const dates =
				layer.dates.length > 0
					? `${layer.dates.length} fechas`
					: "una banda";
			rows.push({
				href: `${DATA_BASE}/${layer.path}`,
				download: layer.path.replaceAll("/", "-"),
				label: layer.name,
				detail: `${dates} · Int16 LE · ${layer.units} · escala ${layer.scale}`,
			});
		}
		for (const overlay of region.overlays) {
			rows.push({
				href: `${DATA_BASE}/${overlay.path}`,
				download: overlay.path.replaceAll("/", "-"),
				label: overlay.name,
				detail: "JSON",
			});
		}
		if (region.events) {
			rows.push({
				href: `${DATA_BASE}/${region.events}`,
				download: region.events.replaceAll("/", "-"),
				label: "Eventos",
				detail: "JSON",
			});
		}
	}
	return rows;
}

async function downloadAll(files: FileRow[]) {
	for (const file of files) {
		const res = await fetch(file.href);
		if (!res.ok) continue;
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = file.download;
		a.click();
		URL.revokeObjectURL(url);
	}
}

function DataCatalogPage() {
	const manifest = useQuery(manifestQuery);
	const files = manifest.data ? filesFromManifest(manifest.data) : [];

	return (
		<main className="min-h-dvh bg-[#05070f] px-4 py-10 text-slate-100">
			<div className="mx-auto max-w-xl space-y-6">
				<p>
					<Link
						to="/"
						className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
					>
						← Visualizador
					</Link>
				</p>
				<header className="space-y-2">
					<h1 className="text-pretty text-2xl font-semibold text-white">
						Datos
					</h1>
					<p className="text-pretty text-sm leading-[1.5] text-slate-400">
						Archivos estáticos del Valle de Mexicali. Los binarios son Int16
						little-endian; −32768 es sin dato. El cubo de hundimiento está en mm
						(multiplicar por la escala del manifiesto para cm).
					</p>
				</header>
				{manifest.isPending && (
					<p className="text-sm text-slate-400">Cargando manifiesto…</p>
				)}
				{manifest.isError && (
					<p className="text-sm text-red-300">No se pudo leer el manifiesto.</p>
				)}
				{files.length > 0 && (
					<>
						<button
							type="button"
							onClick={() => void downloadAll(files)}
							className="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-cyan-400 px-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
						>
							Descargar todo
						</button>
						<ul className="divide-y divide-white/10 rounded-xl border border-white/10">
							{files.map((file) => (
								<li
									key={file.href}
									className="flex items-center justify-between gap-3 px-3 py-3"
								>
									<div className="min-w-0">
										<p className="text-pretty font-semibold text-white">
											{file.label}
										</p>
										<p className="truncate text-xs text-slate-400">
											{file.detail}
										</p>
									</div>
									<a
										href={file.href}
										download={file.download}
										className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-cyan-300 hover:border-cyan-300/50 hover:text-cyan-200"
									>
										Bajar
									</a>
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		</main>
	);
}
