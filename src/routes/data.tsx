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
				layer.dates.length > 0 ? `${layer.dates.length} fechas` : "una banda";
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
			<div className="mx-auto max-w-2xl space-y-6">
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
						Archivos estáticos del Valle de Mexicali. Empieza por el manifiesto;
						el resto son rasters y JSON listos para bajar.
					</p>
				</header>

				<section className="space-y-3 rounded-xl border border-white/10 p-4">
					<h2 className="text-lg font-semibold text-white">Guía rápida</h2>
					<ol className="list-decimal space-y-2 pl-5 text-pretty text-sm leading-[1.5] text-slate-300">
						<li>
							Abre <code className="text-cyan-200">manifest.json</code>. Ahí
							están el bbox, el tamaño de celda, las fechas,{" "}
							<code className="text-cyan-200">scale</code>,{" "}
							<code className="text-cyan-200">nodata</code> (−32768) y los
							créditos. No hace falta adivinar unidades.
						</li>
						<li>
							Los <code className="text-cyan-200">.bin</code> son Int16
							little-endian, fila-mayor, fila 0 al norte.{" "}
							<code className="text-cyan-200">terrain.bin</code> es altura ×
							ancho en metros. Cada <code className="text-cyan-200">cube.bin</code>{" "}
							es fechas × altura × ancho. El hundimiento está guardado en mm:
							multiplica por <code className="text-cyan-200">scale</code> (0.1)
							para cm.
						</li>
						<li>
							Caminos, canales, ríos, ejidos y eventos son JSON. Sirven para
							Excel o GIS; el cubo de radar no cabe bien en una hoja.
						</li>
						<li>
							Mira <code className="text-cyan-200">source</code> en cada capa.
							Si dice <code className="text-cyan-200">synthetic</code>, no es
							una medición NISAR.
						</li>
					</ol>
					<p className="text-pretty text-sm font-semibold text-slate-200">
						Python
					</p>
					<pre className="overflow-x-auto rounded-lg bg-black/50 p-3 font-mono text-xs leading-[1.45] text-slate-200">{`import json, numpy as np

m = json.load(open("manifest.json"))
r = m["regions"][0]
h, w = r["height"], r["width"]
dem = np.fromfile("mexicali/terrain.bin", dtype="<i2").reshape(h, w)

capa = next(l for l in r["layers"] if l["id"] == "subsidence")
raw = np.fromfile("mexicali/subsidence/cube.bin", dtype="<i2")
cube = raw.reshape(len(capa["dates"]), h, w)
cm = np.where(cube == capa["nodata"], np.nan, cube * capa["scale"])`}</pre>
					<p className="text-pretty text-xs leading-[1.5] text-slate-500">
						Celda (col, fila) con origen en la esquina noroeste. El centro de la
						celda (i, j) está en (i + 0.5, j + 0.5). Créditos: NISAR
						NASA/JPL-Caltech e ISRO (ASF DAAC); DEM Copernicus GLO-30.
					</p>
				</section>

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
