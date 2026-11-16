import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Slider } from "#/components/ui/slider";
import { Switch } from "#/components/ui/switch";
import type { AgriZone } from "../lib/agriculture";
import type { CatalogItem } from "../lib/catalog";
import {
	type AgriScience,
	type CellScience,
	type LayerScience,
	LOS_SIGN,
	layerScience,
	type MeasurementScience,
	NO_DATA_NOTE,
	RELIEF_NOTE,
	SYNTHETIC_NOTE,
} from "../lib/science";
import type { Credit, Layer, Region } from "../manifest";
import { Legend, VIEW_HELP } from "./LayerPanel";
import { METHOD_SECTIONS } from "./Overlays";
import {
	ScienceDisclosure,
	ScienceFields,
	ScienceStatus,
} from "./ScienceDisclosure";

export const MeasurementMenu = ({ record }: { record: MeasurementScience }) => {
	if (record.status === "empty") {
		return (
			<ScienceStatus>
				La nave aún no tiene una celda bajo el sensor.
			</ScienceStatus>
		);
	}
	if (record.status === "loading") {
		return <ScienceStatus>Cargando mediciones…</ScienceStatus>;
	}
	if (record.status === "failed") {
		return (
			<ScienceStatus tone="warn">
				No se pudo cargar esta capa. Recarga la página.
			</ScienceStatus>
		);
	}
	return (
		<div className="space-y-4">
			{record.synthetic && (
				<ScienceStatus tone="warn">{SYNTHETIC_NOTE}</ScienceStatus>
			)}
			{record.status === "nodata" ? (
				<ScienceStatus>{NO_DATA_NOTE}</ScienceStatus>
			) : (
				<p className="font-semibold text-2xl text-white tabular-nums">
					{record.displacement}
				</p>
			)}
			<ScienceFields
				fields={[
					{ label: "Tasa lineal", value: record.rate ?? "Sin dato" },
					{ label: "Ventana", value: record.window ?? "Sin fechas" },
					{ label: "Columna", value: record.col ?? "—" },
					{ label: "Fila", value: record.row ?? "—" },
					{ label: "Longitud", value: record.lon ?? "—" },
					{ label: "Latitud", value: record.lat ?? "—" },
					{ label: "Celda", value: record.cellSizeM ?? "—" },
					{ label: "Cota DEM", value: record.groundM ?? "—" },
					{
						label: "Relieve ×",
						value: `${record.reliefExaggeration} · ${RELIEF_NOTE}`,
					},
					{
						label: "Hundimiento ×",
						value: `${record.deformExaggeration} · ${RELIEF_NOTE}`,
					},
				]}
			/>
			<div className="border-t border-white/10 pt-4">
				<p className="text-pretty text-sm leading-[1.5] text-slate-300">
					{LOS_SIGN}
					{record.methodNote ? ` ${record.methodNote}` : ""}
				</p>
			</div>
		</div>
	);
};

export const LayersMenu = ({
	catalog,
	active,
	onSelect,
	displacement,
	visible,
	loading,
	failed,
	fieldLimit,
	zoneCount,
}: {
	catalog: CatalogItem[];
	active: CatalogItem | null;
	onSelect: (item: CatalogItem) => void;
	displacement: Layer | null;
	visible: boolean;
	loading: boolean;
	failed: boolean;
	fieldLimit: number;
	zoneCount: number;
}) => {
	if (catalog.length === 0) {
		return (
			<ScienceStatus>
				Aún no hay capas para esta región. Por ahora puedes explorar su relieve.
			</ScienceStatus>
		);
	}
	return (
		<div className="space-y-2">
			{loading && <ScienceStatus>Cargando mediciones…</ScienceStatus>}
			{failed && (
				<ScienceStatus tone="warn">
					No se pudo cargar esta capa. Recarga la página.
				</ScienceStatus>
			)}
			{catalog.map((item) => {
				const selected = item.view === active?.view;
				const help = item.layer
					? null
					: VIEW_HELP[item.view as keyof typeof VIEW_HELP];
				const meta = item.layer ? layerScience(item.layer) : null;
				return (
					<ScienceDisclosure
						key={item.view}
						title={item.name}
						summary={selected ? "Capa activa" : undefined}
					>
						<div className="space-y-3 px-1 pb-2">
							<button
								type="button"
								disabled={item.disabled}
								aria-pressed={selected}
								onClick={() => onSelect(item)}
								className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold motion-safe:transition-[transform,color,background-color] motion-safe:duration-150 motion-safe:ease-[cubic-bezier(0.2,0,0,1)] motion-safe:active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 ${
									selected
										? "bg-cyan-400 text-slate-950"
										: "bg-white/5 text-slate-100 hover:bg-white/10"
								}`}
							>
								Mostrar en el mapa
							</button>
							{help?.text.map((line) => (
								<p
									key={line}
									className="text-pretty text-sm leading-[1.5] text-slate-300"
								>
									{line}
								</p>
							))}
							{meta && <LayerRecord record={meta} />}
							{visible && selected && (
								<Legend
									item={item}
									displacement={displacement}
									fieldLimit={fieldLimit}
									zoneCount={zoneCount}
								/>
							)}
						</div>
					</ScienceDisclosure>
				);
			})}
		</div>
	);
};

const LayerRecord = ({ record }: { record: LayerScience }) => (
	<div className="space-y-3">
		<p className="max-w-[65ch] text-pretty text-sm leading-[1.5] text-slate-300">
			{record.description}
		</p>
		{record.synthetic && (
			<ScienceStatus tone="warn">{SYNTHETIC_NOTE}</ScienceStatus>
		)}
		<ScienceFields
			fields={[
				{ label: "Unidades", value: record.units },
				{ label: "Escala", value: record.scale },
				{ label: "Sin dato", value: record.nodata },
				{ label: "Codificación", value: record.encoding },
				{ label: "Fechas", value: record.dateRange ?? "Capa estática" },
				{
					label: "Referencia",
					value: record.referenceDate ?? "Sin fecha de referencia",
				},
				{ label: "Rango", value: record.valueRange },
				{ label: "Pintura", value: record.paint },
				{ label: "Paleta", value: record.palette },
				{ label: "Fuente", value: record.sourceName },
			]}
		/>
		{record.classes.length > 0 && (
			<ul className="space-y-1 text-sm">
				{record.classes.map((entry) => (
					<li key={entry.value} className="flex items-center gap-2">
						<span
							className="inline-block size-3 rounded-sm"
							style={{ background: entry.color }}
							aria-hidden
						/>
						<span>
							{entry.name}
							<span className="ms-2 text-slate-400 tabular-nums">
								{entry.value}
							</span>
						</span>
					</li>
				))}
			</ul>
		)}
		<CreditList
			credits={record.credits}
			products={record.products}
			name={record.name}
		/>
	</div>
);

export const PointMenu = ({
	inspected,
	place,
	coords,
	rows,
}: {
	inspected: boolean;
	place: string | null;
	coords: string | null;
	rows: CellScience[];
}) => {
	if (!inspected) {
		return <ScienceStatus>Toca el terreno para leer esta celda.</ScienceStatus>;
	}
	return (
		<div className="space-y-3">
			{place && <p className="font-semibold text-slate-100 text-sm">{place}</p>}
			{coords && (
				<p className="text-slate-400 text-sm tabular-nums">{coords}</p>
			)}
			{rows.map((row) => (
				<ScienceDisclosure
					key={row.name}
					title={row.name}
					summary={
						row.loading ? "Cargando…" : row.missing ? "Sin dato" : row.value
					}
				>
					<div className="space-y-2 px-1 pb-2">
						{row.loading && <ScienceStatus>Cargando mediciones…</ScienceStatus>}
						{row.failed && (
							<ScienceStatus tone="warn">
								No se pudo cargar esta capa. Recarga la página.
							</ScienceStatus>
						)}
						{!row.loading && !row.failed && (
							<ScienceFields
								fields={[
									{ label: "Valor", value: row.value },
									{ label: "Unidades", value: row.units },
									{ label: "Fuente", value: row.sourceName },
									{
										label: "Fecha",
										value: row.dateUsed ?? "Capa estática",
									},
								]}
							/>
						)}
					</div>
				</ScienceDisclosure>
			))}
		</div>
	);
};

export const CropsMenu = ({
	missingCover,
	loading,
	listed,
	selected,
	rejected,
	record,
	moisture,
	dates,
	activeIndex,
	selectedSeries,
	columns,
	vegetation,
	change,
	disturbance,
	water,
	onSelect,
	onCompare,
	onRemove,
}: {
	missingCover: boolean;
	loading: boolean;
	listed: AgriZone[];
	selected: AgriZone | null;
	rejected: boolean;
	record: AgriScience | null;
	moisture: number | null;
	dates: string[];
	activeIndex: number;
	selectedSeries: Array<number | null>;
	columns: Array<{ id: number; areaKm2: number; values: Array<number | null> }>;
	vegetation: string | null;
	change: string | null;
	disturbance: string | null;
	water: string[];
	onSelect: (id: number) => void;
	onCompare: (id: number) => void;
	onRemove: (id: number) => void;
}) => {
	if (missingCover) {
		return (
			<ScienceStatus>
				Falta el mapa de cobertura. Sin él no hay zonas agrícolas.
			</ScienceStatus>
		);
	}
	if (loading) {
		return <ScienceStatus>Cargando mediciones…</ScienceStatus>;
	}
	const fmt = (value: number | null) =>
		value === null ? "Sin dato" : value.toFixed(3);
	return (
		<div className="space-y-4">
			<ul className="space-y-1">
				{listed.map((zone) => (
					<li key={zone.id} className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => onSelect(zone.id)}
							className={`min-h-11 min-w-0 flex-1 rounded-lg border px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:outline-cyan-300 ${
								selected?.id === zone.id
									? "zone-selected border-emerald-400"
									: "border-white/10 text-slate-200 hover:bg-white/10"
							}`}
						>
							Zona {zone.id + 1}
							<span className="ms-2 tabular-nums text-slate-400">
								{zone.areaKm2.toFixed(1)} km²
							</span>
						</button>
						<button
							type="button"
							onClick={() => onCompare(zone.id)}
							className="min-h-11 rounded-lg px-3 text-sm text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
						>
							Comparar zona
						</button>
					</li>
				))}
			</ul>
			{rejected && (
				<ScienceStatus tone="warn">
					La comparación admite hasta 3 zonas.
				</ScienceStatus>
			)}
			{record && selected && (
				<ScienceDisclosure
					title={record.label}
					summary={record.areaKm2}
					defaultOpen
				>
					<div className="space-y-3 px-1 pb-2">
						<ScienceFields
							fields={[
								{ label: "Área", value: record.areaKm2 },
								{ label: "Celdas", value: record.cells },
								{ label: "Centroide", value: record.centroid },
								{ label: "Clase", value: record.coverClass },
								{
									label: "Humedad",
									value:
										moisture === null ? "Sin dato" : `${fmt(moisture)} m³/m³`,
								},
							]}
						/>
						<ul className="space-y-0.5 text-sm tabular-nums">
							{dates.map((date, index) => (
								<li
									key={date}
									className={`flex justify-between rounded px-1 ${
										index === activeIndex
											? "bg-cyan-300/15 text-cyan-100"
											: "text-slate-400"
									}`}
								>
									<span>{date}</span>
									<span>{fmt(selectedSeries[index] ?? null)}</span>
								</li>
							))}
						</ul>
						{vegetation && <p>Vegetación: {vegetation}</p>}
						{change && <p>Superficie: {change}</p>}
						{disturbance && <p>Disturbio: {disturbance}</p>}
						{water.map((line) => (
							<p key={line}>{line}</p>
						))}
						<ul className="space-y-1 text-sm text-slate-400">
							{record.thresholds.map((line) => (
								<li key={line}>{line}</li>
							))}
							{record.limits.map((line) => (
								<li key={line}>{line}</li>
							))}
						</ul>
						{columns.length > 1 && (
							<ul className="space-y-1">
								{columns.map((column) => (
									<li
										key={column.id}
										className="flex items-center justify-between gap-2"
									>
										<span>
											Zona {column.id + 1}
											<span className="ms-2 text-slate-400 tabular-nums">
												{fmt(column.values[activeIndex] ?? null)}
											</span>
										</span>
										{column.id !== selected.id && (
											<button
												type="button"
												onClick={() => onRemove(column.id)}
												className="min-h-11 px-3 text-sm text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
											>
												Quitar zona
											</button>
										)}
									</li>
								))}
							</ul>
						)}
					</div>
				</ScienceDisclosure>
			)}
		</div>
	);
};

export const MethodMenu = () => (
	<div className="space-y-2">
		{METHOD_SECTIONS.map((section) => (
			<ScienceDisclosure key={section.id} title={section.title}>
				<div className="max-w-[65ch] space-y-2 px-1 pb-2 text-pretty text-sm leading-[1.5] text-slate-300">
					{section.body.map((paragraph) => (
						<p key={paragraph}>{paragraph}</p>
					))}
				</div>
			</ScienceDisclosure>
		))}
	</div>
);

export const ProvenanceMenu = ({
	region,
	layer,
}: {
	region: Region;
	layer: Layer | null;
}) => {
	const all = [
		...region.terrain.credits,
		...(layer?.credits ?? []),
		...region.overlays.flatMap((overlay) => overlay.credits),
	];
	const credits = all.filter(
		(credit, index) =>
			all.findIndex((item) => item.name === credit.name) === index,
	);
	return (
		<div className="space-y-4">
			<CreditList
				credits={credits}
				products={layer?.products ?? []}
				name={layer?.name ?? region.name}
			/>
			<p className="text-pretty text-sm leading-[1.5] text-slate-400">
				Las plantas, las casas y los autos son figuras ilustrativas, no un
				producto de satélite.
			</p>
			<Link
				to="/data"
				className="inline-flex text-sm font-semibold text-cyan-300 underline decoration-dotted underline-offset-2 hover:text-cyan-200"
			>
				Descargar datasets
			</Link>
		</div>
	);
};

const CreditList = ({
	credits,
	products,
	name,
}: {
	credits: Credit[];
	products: string[];
	name: string;
}) => (
	<div className="space-y-3">
		<ul className="space-y-3">
			{credits.map((credit) => (
				<li key={credit.name}>
					<p className="font-semibold text-white">{credit.name}</p>
					<p className="text-sm text-slate-400">{credit.attribution}</p>
					{credit.url.startsWith("http") && (
						<a
							href={credit.url}
							target="_blank"
							rel="noreferrer"
							className="mt-0.5 inline-flex items-center gap-1 text-sm text-cyan-300 underline decoration-dotted underline-offset-2 hover:text-cyan-200 [overflow-wrap:break-word]"
						>
							{credit.name}
							<ExternalLink className="size-3 stroke-[2]" aria-hidden />
						</a>
					)}
				</li>
			))}
		</ul>
		{products.length > 0 && (
			<ScienceDisclosure
				title={`${products.length} productos NISAR en «${name}»`}
			>
				<ul className="space-y-1 font-mono text-xs text-slate-400">
					{products.map((product) => (
						<li key={product} className="[overflow-wrap:break-word]">
							{product}
						</li>
					))}
				</ul>
			</ScienceDisclosure>
		)}
	</div>
);

export const SceneMenu = ({
	layerVisible,
	onLayerVisible,
	opacity,
	onOpacity,
	overlays,
	onOverlay,
	hasWater,
	waterMotion,
	onWaterMotion,
}: {
	layerVisible: boolean;
	onLayerVisible: (visible: boolean) => void;
	opacity: number;
	onOpacity: (opacity: number) => void;
	overlays: Array<{ id: string; name: string; on: boolean; km: number | null }>;
	onOverlay: (id: string, on: boolean) => void;
	hasWater: boolean;
	waterMotion: boolean;
	onWaterMotion: (on: boolean) => void;
}) => (
	<div className="space-y-4">
		<SceneToggle
			id="scene-layer"
			label="Mostrar capa"
			checked={layerVisible}
			onChange={onLayerVisible}
		/>
		<div className="space-y-2">
			<label htmlFor="scene-opacity" className="text-sm text-slate-200">
				Opacidad
			</label>
			<Slider
				id="scene-opacity"
				aria-label="Opacidad de la capa"
				min={0}
				max={1}
				step={0.05}
				value={[opacity]}
				onValueChange={([value]) => onOpacity(value)}
			/>
		</div>
		{overlays.map((overlay) => (
			<SceneToggle
				key={overlay.id}
				id={`scene-${overlay.id}`}
				label={`Mostrar ${overlay.name.toLowerCase()}`}
				detail={
					overlay.on && overlay.km !== null
						? `${overlay.km.toFixed(1)} km en zona de cambio`
						: undefined
				}
				checked={overlay.on}
				onChange={(value) => onOverlay(overlay.id, value)}
			/>
		))}
		{hasWater && (
			<SceneToggle
				id="scene-water"
				label="Mostrar agua animada"
				detail="La extensión viene de las mediciones; el oleaje es decorativo."
				checked={waterMotion}
				onChange={onWaterMotion}
			/>
		)}
		<p className="text-pretty text-sm leading-[1.5] text-slate-400">
			Las plantas, las casas y los autos son figuras. No son una medición del
			radar.
		</p>
	</div>
);

const SceneToggle = ({
	id,
	label,
	detail,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	detail?: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) => (
	<div className="flex min-h-11 items-center justify-between gap-3">
		<label htmlFor={id} className="min-w-0">
			<span className="block font-semibold text-slate-100 text-sm">
				{label}
			</span>
			{detail && <span className="block text-slate-400 text-sm">{detail}</span>}
		</label>
		<Switch id={id} checked={checked} onCheckedChange={onChange} />
	</div>
);
