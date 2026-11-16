import { Canvas } from "@react-three/fiber";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard } from "./controls/useKeyboard";
import {
	ejidosQuery,
	eventsQuery,
	type ImpactEvent,
	layerCubeQuery,
	manifestQuery,
	overlayQuery,
	rasterQuery,
	terrainQuery,
} from "./data/queries";
import {
	hasWebGL2,
	useIsCompact,
	usePrefersReducedMotion,
} from "./hooks/useMedia";
import {
	alignSeries,
	barrierMask,
	buildZones,
	changeWord,
	cropMask,
	disturbanceWord,
	listedZones,
	moistureSeries,
	nearestWaterway,
	paintWayFlags,
	vegetationWord,
	waterBeside,
	waterLines,
	withComparison,
} from "./lib/agriculture";
import {
	buildCatalog,
	type CatalogItem,
	categoricalPlane,
	classColors,
	continuousPlane,
	displacementLayer,
	eventView,
	nearestDateIndex,
	resolveView,
	sourceAt,
} from "./lib/catalog";
import { nearestPoi, TREND_LABELS, trendLevel } from "./lib/friendly";
import { gridToLonLat, sampleBilinear } from "./lib/grid";
import {
	BAND_COLORS,
	createImpactAnalysis,
	MAX_LABELED_ZONES,
	MIN_DATES_ACCELERATION,
	rankedSubsidenceZones,
	zoneContext,
} from "./lib/impact";
import {
	affectedSegments,
	nearestSegment,
	toSegments,
} from "./lib/infrastructure";
import { type CropId, placeMapModels, urbanCityMask } from "./lib/mapModels";
import { linearRate, readSeries } from "./lib/probe";
import {
	agriZoneScience,
	cellScience,
	impactZoneRankScience,
	impactZoneScience,
	measurementScience,
} from "./lib/science";
import { fillForDisplay, robustLimit, velocityField } from "./lib/stats";
import { waterDateIndex, waterMask } from "./lib/water";
import type { Overlay, Poi, Region } from "./manifest";
import { createFlight, FlightContext, teleport } from "./scene/flight";
import { PaintMode } from "./scene/layerMaterial";
import { Scene } from "./scene/Scene";
import {
	baseHeightFn,
	DEFAULT_EXAGGERATION,
	terrainStep,
} from "./scene/terrainGeometry";
import {
	explorerStore,
	layerUi,
	type MapView,
	overlayOn,
	viewFingerprint,
} from "./store";
import { EjidoLabels } from "./ui/EjidoLabels";
import { EventsList } from "./ui/EventsList";
import { MeasurementChat } from "./ui/MeasurementChat";
import { ControlsHint, NoWebGL, WarpOverlay } from "./ui/Overlays";
import { PoiLabels } from "./ui/PoiLabels";
import { ScienceMenuBar, type ScienceMenuId } from "./ui/ScienceMenuBar";
import {
	CropsMenu,
	LayersMenu,
	MeasurementMenu,
	MethodMenu,
	PointMenu,
	ProvenanceMenu,
	SceneMenu,
} from "./ui/ScienceMenus";
import { Timeline } from "./ui/Timeline";
import { ZoneLabels } from "./ui/ZoneLabels";

const NO_COLORS: string[] = [];
const NO_OVERLAYS: Overlay[] = [];
const LINE_OVERLAYS = new Set(["road", "canal", "river"]);

function timelineNote(view: MapView, deform3d: boolean) {
	if (view !== "velocity" && view !== "acceleration") return undefined;
	const base =
		view === "velocity"
			? "La velocidad no depende de la fecha: es la tendencia de toda la serie."
			: "La aceleración no depende de la fecha: compara las dos mitades de la serie.";
	return deform3d ? `${base} El relieve 3D sí sigue la fecha.` : base;
}

const WARP_OUT_MS = 450;
const WARP_IN_MS = 400;
const DEFAULT_POI = "cerro-prieto";
/** Estado de UI de la capa principal: visibilidad y opacidad son comunes a todas. */
const MAIN_LAYER = "main";
const exaggeration = DEFAULT_EXAGGERATION;
const store = explorerStore;

export function Explorer() {
	const [webgl] = useState(hasWebGL2);
	if (!webgl) return <NoWebGL />;
	return <ExplorerScene />;
}

export function ExplorerLoading({
	label = "Preparando el explorador…",
}: {
	label?: string;
}) {
	return (
		<div className="flex h-dvh items-center justify-center bg-[#05070f] text-slate-300">
			<p className="flex items-center gap-2 text-sm">
				<Loader2 className="size-4 animate-spin" aria-hidden /> {label}
			</p>
		</div>
	);
}

function LiveMeasurement({
	region,
	cube,
	cubePending,
	cubeFailed,
	timelineLayer,
	dispIndex,
	terrain,
	source,
}: {
	region: Region;
	cube: Int16Array | undefined;
	cubePending: boolean;
	cubeFailed: boolean;
	timelineLayer: ReturnType<typeof displacementLayer>;
	dispIndex: number;
	terrain: Int16Array | undefined;
	source: ReturnType<typeof sourceAt>;
}) {
	const probe = useSelector(store, (s) => s.probe);
	const deformFactor = useSelector(store, (s) => s.deformFactor);
	const probeSeries =
		timelineLayer && cube && probe
			? readSeries(cube, region, timelineLayer, probe.col, probe.row)
			: null;
	const probeRate =
		probeSeries && timelineLayer
			? linearRate(probeSeries, timelineLayer.dates)
			: null;
	return (
		<MeasurementMenu
			record={measurementScience({
				probe,
				series: probeSeries,
				dateIndex: dispIndex,
				dates: timelineLayer?.dates ?? [],
				rate: probeRate,
				cellSizeM: region.cellSizeM,
				groundM:
					probe && terrain
						? sampleBilinear(
								terrain,
								region.width,
								region.height,
								probe.col,
								probe.row,
							)
						: null,
				reliefExaggeration: exaggeration,
				deformExaggeration: deformFactor,
				loading: Boolean(timelineLayer) && cubePending,
				failed: Boolean(timelineLayer) && cubeFailed,
				source,
				methodNote:
					probeRate === null ? null : TREND_LABELS[trendLevel(probeRate)],
			})}
		/>
	);
}

function ExplorerScene() {
	useSelector(store, viewFingerprint);
	const state = store.state;
	const reducedMotion = usePrefersReducedMotion();
	const compact = useIsCompact();
	const keys = useKeyboard();
	const [scienceOpen, setScienceOpen] = useState<ScienceMenuId | null>(null);
	const [modelFocus, setModelFocus] = useState<CropId | null>(null);
	const [compareRejected, setCompareRejected] = useState(false);
	const labels = useRef(new Map<string, HTMLElement>());
	const zoneLabels = useRef(new Map<string, HTMLElement>());
	const ejidoLabels = useRef(new Map<string, HTMLElement>());
	const flight = useMemo(createFlight, []);

	const manifest = useQuery(manifestQuery);
	const region =
		manifest.data?.regions.find((r) => r.id === state.regionId) ?? null;
	const terrain = useQuery(terrainQuery(region));

	// Capa de desplazamiento: base del movimiento y del hundimiento 3D.
	const timelineLayer = displacementLayer(region);
	const mainUi = layerUi(state, MAIN_LAYER);
	const activeLayer = mainUi.visible ? timelineLayer : null;
	const cube = useQuery(layerCubeQuery(region, timelineLayer));

	// Catálogo: qué pinta el mapa y con qué fechas.
	const catalog = useMemo(
		() => (region ? buildCatalog(region, MIN_DATES_ACCELERATION) : []),
		[region],
	);
	const item = resolveView(catalog, state.mapView);
	const raster = item?.layer ?? null;
	const rasterData = useQuery(rasterQuery(region, raster));
	const timelineDates = raster ? raster.dates : (timelineLayer?.dates ?? []);
	const currentDate =
		timelineDates[Math.min(state.dateIndex, timelineDates.length - 1)] ?? null;
	// El relieve sigue a la fecha más cercana de la capa de desplazamiento.
	const dispIndex = Math.max(
		nearestDateIndex(timelineLayer?.dates ?? [], currentDate),
		0,
	);

	const activeCube = activeLayer ? (cube.data ?? null) : null;

	// Análisis de la capa: velocidad una vez por cubo.
	const velocity = useMemo(
		() =>
			region && timelineLayer && cube.data
				? velocityField(cube.data, {
						width: region.width,
						height: region.height,
						dates: timelineLayer.dates,
						scale: timelineLayer.scale,
						nodata: timelineLayer.nodata,
					})
				: null,
		[region, timelineLayer, cube.data],
	);
	const velocityLimit = useMemo(
		() => (velocity ? robustLimit(velocity) : 1),
		[velocity],
	);
	// Vistas de impacto: lo que pinta el mapa según el selector.
	const impact = useMemo(
		() =>
			region && timelineLayer && cube.data && velocity
				? createImpactAnalysis(
						cube.data,
						{
							width: region.width,
							height: region.height,
							dates: timelineLayer.dates,
							scale: timelineLayer.scale,
							nodata: timelineLayer.nodata,
						},
						velocity,
						region.cellSizeM,
					)
				: null,
		[region, timelineLayer, cube.data, velocity],
	);
	const view = item?.view ?? "cumulative";
	const motionZoneMap = impact?.zones(dispIndex) ?? null;
	const zoneData = view === "zones" ? motionZoneMap : null;
	const zones = zoneData?.zones.slice(0, MAX_LABELED_ZONES) ?? [];

	// Plano de una capa raster en la fecha actual.
	const rasterIndex = raster
		? Math.max(nearestDateIndex(raster.dates, currentDate), 0)
		: 0;
	const rasterPlane = useMemo(() => {
		if (!raster || !rasterData.data || !region) return null;
		const plane = region.width * region.height;
		return raster.paint === "categorical"
			? categoricalPlane(rasterData.data, plane, rasterIndex)
			: continuousPlane(rasterData.data, raster, plane, rasterIndex);
	}, [raster, rasterData.data, region, rasterIndex]);
	const rasterBands = rasterPlane instanceof Uint8Array ? rasterPlane : null;
	const rasterField = rasterPlane instanceof Float32Array ? rasterPlane : null;

	const field =
		rasterField ??
		(view === "velocity"
			? velocity
			: view === "differential"
				? (impact?.differential(dispIndex) ?? null)
				: view === "acceleration"
					? (impact?.acceleration() ?? null)
					: null);
	const fieldLimit = raster
		? raster.paint === "diverging"
			? Math.max(Math.abs(raster.valueRange[0]), Math.abs(raster.valueRange[1]))
			: raster.valueRange[1]
		: view === "velocity"
			? velocityLimit
			: view === "differential"
				? (impact?.differentialLimit() ?? 1)
				: view === "acceleration"
					? (impact?.accelerationLimit() ?? 1)
					: 1;
	const paintMode = raster
		? raster.paint === "categorical"
			? PaintMode.BANDS
			: raster.paint === "sequential"
				? PaintMode.FIELD_SEQUENTIAL
				: PaintMode.FIELD_DIVERGING
		: view === "zones"
			? PaintMode.BANDS
			: view === "differential"
				? PaintMode.FIELD_SEQUENTIAL
				: view === "velocity" || view === "acceleration"
					? PaintMode.FIELD_DIVERGING
					: PaintMode.CUBE;
	const bandPalette = useMemo(
		() => (raster ? classColors(raster, BAND_COLORS[0]) : NO_COLORS),
		[raster],
	);

	// Hundimiento 3D (D13): unidades de escena por cm, ×N respecto a la escala horizontal.
	const deformScale =
		state.deform3d && region && activeCube
			? state.deformFactor / 100 / region.cellSizeM
			: 0;

	// Cubo de geometría con huecos rellenados: solo se calcula si se activa el 3D.
	// biome-ignore lint/correctness/useExhaustiveDependencies: deform3d queda fijo en el store
	const deformCube = useMemo(
		() =>
			state.deform3d && region && timelineLayer && activeCube
				? fillForDisplay(activeCube, {
						width: region.width,
						height: region.height,
						dates: timelineLayer.dates,
						scale: timelineLayer.scale,
						nodata: timelineLayer.nodata,
					})
				: null,
		[state.deform3d, region, timelineLayer, activeCube],
	);

	const baseHeightAt = useMemo(
		() =>
			region && terrain.data
				? baseHeightFn(region, terrain.data, exaggeration)
				: () => 0,
		[region, terrain.data],
	);
	const heightAt = useMemo(() => {
		if (!region || !terrain.data) return () => 0;
		const { width: W, height: H } = region;
		const plane = W * H;
		const layer = timelineLayer;
		const offset = Math.min(dispIndex, (layer?.dates.length ?? 1) - 1) * plane;
		return (col: number, row: number) => {
			const base = baseHeightAt(col, row);
			if (!deformScale || !deformCube) return base;
			const d = sampleBilinear(deformCube, W, H, col, row, undefined, offset);
			return Number.isFinite(d) ? base + d * deformScale : base;
		};
	}, [
		region,
		terrain.data,
		baseHeightAt,
		deformScale,
		deformCube,
		timelineLayer,
		dispIndex,
	]);

	// Agua: se carga en segundo plano; si falla, el mapa sigue con su color de siempre.
	const waterLayer = region?.layers.find((l) => l.id === "water") ?? null;
	const waterData = useQuery(rasterQuery(region, waterLayer));
	const waterCube = waterData.data;
	const waterGrid = useMemo(
		() =>
			region && waterLayer && waterCube instanceof Uint8Array
				? waterMask(
						waterCube,
						region.width,
						region.height,
						waterLayer.dates.length,
					)
				: null,
		[region, waterLayer, waterCube],
	);
	const water = useMemo(
		() =>
			waterGrid && waterLayer
				? {
						mask: waterGrid,
						dates: waterLayer.dates.length,
						index: waterDateIndex(waterLayer.dates, currentDate),
					}
				: null,
		[waterGrid, waterLayer, currentDate],
	);

	// La nave, los faros y el picking siguen la superficie actual (incluido el hundimiento 3D).
	useEffect(() => {
		flight.heightAt = heightAt;
	}, [flight, heightAt]);
	const heightAtRef = useRef(heightAt);
	heightAtRef.current = heightAt;

	// Llegada a una región (inicio o tras warp): configurar el vuelo y ubicar la nave.
	const arrival = useRef<string | null>(DEFAULT_POI);
	const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
	const [readyRegion, setReadyRegion] = useState<string | null>(null);
	useEffect(() => {
		if (!region || !terrain.data) return;
		flight.width = region.width;
		flight.height = region.height;
		flight.heightAt = heightAtRef.current;
		const poi =
			region.pois.find((p) => p.id === arrival.current) ??
			region.pois[0] ??
			null;
		teleport(
			flight,
			poi?.col ?? region.width / 2,
			poi?.row ?? region.height / 2,
		);
		arrival.current = null;
		setScienceOpen(null);
		setModelFocus(null);
		setReadyRegion(region.id);
		if (store.state.warping) {
			const id = window.setTimeout(
				() => store.actions.setWarping(false),
				reducedMotion ? 0 : WARP_IN_MS,
			);
			return () => window.clearTimeout(id);
		}
	}, [region, terrain.data, flight, reducedMotion]);

	const goTo = useCallback(
		(target: Region, poi: Poi) => {
			if (target.id === store.state.regionId) {
				flight.target = { col: poi.col, row: poi.row };
				setSelectedPoiId(poi.id);
				return;
			}
			if (store.state.warping) return;
			arrival.current = poi.id;
			store.actions.setWarping(true);
			window.setTimeout(
				() => store.actions.setRegion(target.id),
				reducedMotion ? 0 : WARP_OUT_MS,
			);
		},
		[flight, reducedMotion],
	);

	const dateCount = timelineDates.length;
	// Infraestructura: tramos resaltados según la fecha.
	const overlayList = (region?.overlays ?? NO_OVERLAYS).filter(
		(overlay): overlay is Overlay & { kind: "road" | "canal" | "river" } =>
			LINE_OVERLAYS.has(overlay.kind),
	);
	const ejidoOverlay =
		region?.overlays.find((overlay) => overlay.kind === "ejido") ?? null;
	const ejidos = useQuery(ejidosQuery(ejidoOverlay));
	const overlayData = useQueries({
		queries: overlayList.map((o) => ({
			...overlayQuery(o),
		})),
	});
	const overlayBands = overlayList.some((o) => overlayOn(state, o.id))
		? (impact?.zones(dispIndex).bands ?? null)
		: null;
	const overlayDiff = overlayBands
		? (impact?.differential(dispIndex) ?? null)
		: null;
	const overlayCut = overlayBands
		? (impact?.differentialLimit() ?? 1) * 0.6
		: 1;
	const overlaySignature = overlayData.map((d) => d.dataUpdatedAt).join();
	// biome-ignore lint/correctness/useExhaustiveDependencies: overlaySignature resume overlayData, que cambia de identidad en cada render
	const overlayModels = useMemo(
		() =>
			overlayList.map((o, i) => {
				const features = overlayData[i]?.data ?? [];
				const segments = toSegments(features, region?.cellSizeM ?? 1);
				const hit = affectedSegments(
					segments,
					region?.width ?? 0,
					region?.height ?? 0,
					overlayBands,
					overlayDiff,
					overlayCut,
				);
				return { ...o, segments, ...hit, features };
			}),
		[
			overlaySignature,
			overlayList,
			region,
			overlayBands,
			overlayDiff,
			overlayCut,
		],
	);

	// Población y uso de suelo para las etiquetas de zona.
	const popLayer = region?.layers.find((l) => l.id === "population") ?? null;
	const landLayer = region?.layers.find((l) => l.id === "landcover") ?? null;
	const popData = useQuery({
		...rasterQuery(region, popLayer),
		enabled: Boolean(popLayer) && Boolean(impact),
	});
	const landData = useQuery({
		...rasterQuery(region, landLayer),
		enabled:
			Boolean(landLayer) && (view === "zones" || region?.id === "mexicali"),
	});
	const landNames = useMemo(
		() =>
			Object.fromEntries(
				(landLayer?.classes ?? []).map((c) => [c.value, c.name]),
			),
		[landLayer],
	);

	const cityMask = useMemo(() => {
		if (region?.id !== "mexicali" || !landData.data) return null;
		const city = region.pois.find((poi) => poi.id === "mexicali-centro");
		if (!city) return null;
		return urbanCityMask(
			landData.data,
			region.width,
			region.height,
			city.col,
			city.row,
		);
	}, [region, landData.data]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: overlaySignature resume overlayData, que cambia de identidad en cada render
	const mapModels = useMemo(() => {
		if (region?.id !== "mexicali") return [];
		const roads = overlayList.flatMap((overlay, index) =>
			overlay.kind === "road" ? (overlayData[index]?.data ?? []) : [],
		);
		return placeMapModels({
			landcover: landData.data ?? null,
			width: region.width,
			height: region.height,
			roads,
			crops: Boolean(landData.data),
			settlements: Boolean(landData.data),
			cars: roads.length > 0,
			cropStride: compact ? 8 : 5,
			urbanStride: compact ? 7 : 5,
		});
	}, [region, landData.data, overlayList, overlaySignature, compact]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: overlaySignature resume overlayData
	const agriMask = useMemo(() => {
		if (region?.id !== "mexicali" || !landData.data) return null;
		const waterways = overlayList.flatMap((overlay, index) =>
			overlay.kind === "canal" || overlay.kind === "river"
				? (overlayData[index]?.data ?? [])
				: [],
		);
		const barriers = barrierMask(region.width, region.height, waterways);
		const map = buildZones(
			landData.data,
			region.width,
			region.height,
			region.cellSizeM,
			barriers,
		);
		return cropMask(map.owner, null);
	}, [region, landData.data, overlayList, overlaySignature]);

	const events = useQuery(eventsQuery(region));
	const agriOpen = region?.id === "mexicali" && scienceOpen === "cultivos";
	const findLayer = (id: string) =>
		region?.layers.find((layer) => layer.id === id) ?? null;
	const moistureLayer = findLayer("moisture");
	const hvLayer = findLayer("hv");
	const changeLayer = findLayer("change");
	const disturbanceLayer = findLayer("disturbance");
	const moistureQ = useQuery({
		...rasterQuery(region, moistureLayer),
		enabled: Boolean(agriOpen && moistureLayer),
	});
	const hvQ = useQuery({
		...rasterQuery(region, hvLayer),
		enabled: Boolean(agriOpen && hvLayer),
	});
	const changeQ = useQuery({
		...rasterQuery(region, changeLayer),
		enabled: Boolean(agriOpen && changeLayer),
	});
	const disturbanceQ = useQuery({
		...rasterQuery(region, disturbanceLayer),
		enabled: Boolean(agriOpen && disturbanceLayer),
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: overlaySignature resume overlayData
	const waterways = useMemo(
		() =>
			overlayList.flatMap((overlay, index) => {
				if (overlay.kind !== "canal" && overlay.kind !== "river") return [];
				const features = overlayData[index]?.data ?? [];
				return [
					{
						id: overlay.id,
						kind: overlay.kind,
						features,
						segments: toSegments(features, region?.cellSizeM ?? 1),
					},
				];
			}),
		[overlaySignature, overlayList, region?.cellSizeM],
	);
	const agriMap = useMemo(() => {
		if (region?.id !== "mexicali" || !landData.data) return null;
		const barriers = barrierMask(
			region.width,
			region.height,
			waterways.flatMap((way) => way.features),
		);
		return buildZones(
			landData.data,
			region.width,
			region.height,
			region.cellSizeM,
			barriers,
		);
	}, [region, landData.data, waterways]);
	const selectedAgri =
		agriMap?.zones.find((zone) => zone.id === state.agriZoneId) ?? null;
	useEffect(() => {
		if (!selectedAgri) return;
		flight.target = { col: selectedAgri.col, row: selectedAgri.row };
	}, [selectedAgri, flight]);
	const inspectQueries = useQueries({
		queries: (region?.layers ?? [])
			.filter((layer) => layer.type === "raster")
			.map((layer) => ({
				...rasterQuery(region, layer),
				enabled: Boolean(state.inspected),
			})),
	});

	if (manifest.isError) {
		return (
			<ExplorerLoading
				label={`No se pudieron cargar los datos: ${manifest.error.message}`}
			/>
		);
	}
	if (!manifest.data || !region)
		return <ExplorerLoading label="Cargando datos de NISAR…" />;

	const shownLayer = raster ?? activeLayer;
	const currentSource = shownLayer ? sourceAt(shownLayer, currentDate) : null;
	const displacementSource = timelineLayer
		? sourceAt(timelineLayer, currentDate)
		: null;
	const motionZones = rankedSubsidenceZones(motionZoneMap?.zones ?? []).map(
		(zone, index) => {
			const ctx = zoneContext(
				zone,
				popData.data ?? null,
				landData.data ?? null,
				landNames,
			);
			return impactZoneScience(zone, {
				rank: index + 1,
				date: timelineLayer?.dates[dispIndex] ?? null,
				people: ctx.people,
				landUse: ctx.landUse,
				place:
					nearestPoi(region.pois, zone.col, zone.row, region.cellSizeM)?.text ??
					null,
				synthetic: displacementSource === "synthetic",
			});
		},
	);
	const motionRank = impact
		? impactZoneRankScience({
				date: timelineLayer?.dates[dispIndex] ?? null,
				zones: motionZones,
				synthetic: displacementSource === "synthetic",
			})
		: null;

	const inspected = state.inspected;
	const rasterLayers = region.layers.filter((layer) => layer.type === "raster");
	const pointRows = inspected
		? [
				...(timelineLayer
					? [
							cellScience(
								timelineLayer,
								cube.data,
								region,
								inspected.col,
								inspected.row,
								currentDate,
								{ loading: cube.isPending, failed: cube.isError },
							),
						]
					: []),
				...rasterLayers.map((layer, index) =>
					cellScience(
						layer,
						inspectQueries[index]?.data,
						region,
						inspected.col,
						inspected.row,
						currentDate,
						{
							loading: Boolean(inspectQueries[index]?.isPending),
							failed: Boolean(inspectQueries[index]?.isError),
						},
					),
				),
			]
		: [];
	if (inspected) {
		for (const overlay of overlayModels) {
			const segment = nearestSegment(
				overlay.segments,
				inspected.col,
				inspected.row,
			);
			if (!segment) continue;
			const feature = overlay.features[segment.feature];
			pointRows.push({
				name:
					overlay.kind === "canal"
						? "Canal"
						: overlay.kind === "river"
							? "Río"
							: "Camino",
				value: feature.name || feature.class,
				units: "nombre",
				sourceName: overlay.credits[0]?.name ?? "OpenStreetMap",
				dateUsed: null,
				missing: false,
				loading: false,
				failed: false,
			});
		}
	}
	const [inspectLon, inspectLat] = inspected
		? gridToLonLat(region, inspected.col, inspected.row)
		: [0, 0];

	const agriList = agriMap
		? listedZones(agriMap.zones)
		: { listed: [], omitted: false };
	const moistureIndex = moistureLayer
		? Math.max(nearestDateIndex(moistureLayer.dates, currentDate), 0)
		: 0;
	const signalIndex = (dates: string[]) =>
		Math.max(nearestDateIndex(dates, currentDate), 0);
	const agriPlane = region.width * region.height;
	const asInt16 = (data: Int16Array | Uint8Array | undefined) =>
		data instanceof Int16Array ? data : null;
	const asBytes = (data: Int16Array | Uint8Array | undefined) =>
		data instanceof Uint8Array ? data : null;
	const selectedSeries =
		selectedAgri && moistureLayer
			? moistureSeries(
					selectedAgri.cells,
					asInt16(moistureQ.data),
					moistureLayer.dates.length,
					agriPlane,
					moistureLayer.scale,
					moistureLayer.nodata,
				)
			: [];
	const compareColumns = [selectedAgri?.id, ...state.agriCompare]
		.filter((id): id is number => id !== undefined)
		.flatMap((id) => {
			const zone = agriMap?.zones[id];
			if (!zone || !moistureLayer) return [];
			return [
				{
					id,
					areaKm2: zone.areaKm2,
					values: moistureSeries(
						zone.cells,
						asInt16(moistureQ.data),
						moistureLayer.dates.length,
						agriPlane,
						moistureLayer.scale,
						moistureLayer.nodata,
					),
				},
			];
		});
	const compared = alignSeries(
		compareColumns.map((column) => ({
			dates: moistureLayer?.dates ?? [],
			values: column.values,
		})),
	);
	const waterIndex = waterLayer
		? Math.max(nearestDateIndex(waterLayer.dates, currentDate), 0)
		: 0;
	const waterTouch =
		selectedAgri && waterData.data
			? waterBeside(
					selectedAgri.cells,
					categoricalPlane(waterData.data, agriPlane, waterIndex),
					region.width,
					region.height,
				)
			: { permanent: false, fresh: false };
	const wayHit = selectedAgri
		? nearestWaterway(
				selectedAgri.cells,
				region.width,
				region.cellSizeM,
				waterways,
			)
		: null;
	const agriWater = selectedAgri
		? waterLines(
				wayHit,
				waterTouch,
				waterways.some((way) => way.kind === "river"),
			)
		: [];
	const sceneOverlays = overlayModels
		.filter((overlay) => overlayOn(state, overlay.id))
		.map((overlay) => ({
			...overlay,
			flags: paintWayFlags(
				overlay.flags,
				overlay.segments,
				wayHit?.overlayId === overlay.id ? wayHit.feature : null,
			),
		}));
	const goToEvent = (event: ImpactEvent) => {
		const next = catalog.find((entry) => entry.view === eventView(event.type));
		if (next) {
			store.actions.setView(
				next.view,
				nearestDateIndex(
					next.layer ? next.layer.dates : (timelineLayer?.dates ?? []),
					event.dateEnd ?? event.date,
				),
			);
		}
		setSelectedPoiId(null);
		flight.target = { col: event.col, row: event.row };
	};
	const selectItem = (next: CatalogItem) =>
		store.actions.setView(
			next.view,
			nearestDateIndex(
				next.layer ? next.layer.dates : (timelineLayer?.dates ?? []),
				currentDate,
			),
		);
	const scienceItems = [
		{ id: "medicion" as const, label: "Medición" },
		{ id: "capas" as const, label: "Capas" },
		{ id: "punto" as const, label: "Punto" },
		...(region.id === "mexicali"
			? [{ id: "cultivos" as const, label: "Cultivos" }]
			: []),
		{ id: "eventos" as const, label: "Eventos" },
		{ id: "metodo" as const, label: "Método" },
		{ id: "procedencia" as const, label: "Procedencia" },
		{ id: "escena" as const, label: "Escena" },
	];

	const sceneReady = terrain.data && readyRegion === region.id;
	return (
		<FlightContext.Provider value={flight}>
			<a
				href="#mapa"
				className="sr-only focus:not-sr-only focus:absolute focus:top-[max(0.5rem,env(safe-area-inset-top))] focus:left-3 focus:z-50 focus:rounded-lg focus:bg-cyan-300 focus:px-3 focus:py-2 focus:font-semibold focus:text-slate-950 focus:outline-2 focus:outline-offset-2 focus:outline-white"
			>
				Ir al mapa
			</a>
			<div
				id="mapa"
				className="relative h-dvh w-full overflow-hidden bg-[#05070f] text-slate-100"
			>
				<div className="absolute inset-0">
					{sceneReady && terrain.data && (
						<Canvas
							dpr={compact ? 1 : [1, 1.5]}
							performance={{ min: 0.5, max: 1, debounce: 200 }}
							gl={{
								antialias: !compact,
								powerPreference: compact ? "low-power" : "high-performance",
								stencil: false,
							}}
						>
							<Scene
								region={region}
								heights={terrain.data}
								exaggeration={exaggeration}
								step={terrainStep(region.width, region.height, compact)}
								layer={activeLayer}
								cube={activeCube}
								layerVisible={mainUi.visible}
								layerOpacity={mainUi.opacity}
								dateIndex={dispIndex}
								reducedMotion={reducedMotion}
								heightAt={heightAt}
								baseHeightAt={baseHeightAt}
								paintMode={paintMode}
								field={field}
								fieldLimit={fieldLimit}
								fieldMin={
									raster?.paint === "sequential" ? raster.valueRange[0] : 0
								}
								palette={raster?.palette ?? "heat"}
								bands={rasterBands ?? zoneData?.bands ?? null}
								bandPalette={raster ? bandPalette : BAND_COLORS}
								contour={!raster}
								overlays={sceneOverlays}
								ejidos={ejidos.data ?? []}
								ejidoLabels={ejidoLabels}
								arrows={raster?.id === "east-west" ? rasterField : null}
								zones={zones}
								agriCells={selectedAgri?.cells ?? null}
								agriMask={agriMask}
								mapModels={mapModels}
								modelFocus={modelFocus}
								cityMask={cityMask}
								cityLive={selectedPoiId === "mexicali-centro"}
								zoneLabels={zoneLabels}
								deformScale={deformScale}
								deformCube={deformCube}
								water={water}
								waterMotion={state.waterMotion}
								keys={keys}
								labels={labels}
								store={store}
								publishProbe={scienceOpen === "medicion"}
							/>
						</Canvas>
					)}
					{sceneReady && (
						<PoiLabels
							pois={region.pois}
							labels={labels}
							selectedId={selectedPoiId}
							onSelect={(poi) => goTo(region, poi)}
						/>
					)}
					{sceneReady && (
						<EjidoLabels
							ejidos={ejidos.data ?? []}
							labels={ejidoLabels}
							onSelect={(ejido) => {
								setSelectedPoiId(null);
								flight.target = { col: ejido.col, row: ejido.row };
							}}
						/>
					)}
					{sceneReady && (
						<ZoneLabels
							zones={zones}
							labels={zoneLabels}
							onSelect={(zone) => {
								setSelectedPoiId(null);
								flight.target = { col: zone.col, row: zone.row };
							}}
							context={(zone) =>
								zoneContext(
									zone,
									popData.data ?? null,
									landData.data ?? null,
									landNames,
								)
							}
						/>
					)}
					{!sceneReady && (
						<ExplorerLoading label={`Cargando relieve de ${region.name}…`} />
					)}
				</div>

				<WarpOverlay active={state.warping} reducedMotion={reducedMotion} />

				<div className="hud-safe pointer-events-none absolute inset-0 flex min-h-0 flex-col gap-2 sm:gap-3">
					<div className="flex min-h-0 min-w-0 flex-1 gap-2 sm:gap-3">
						<MeasurementChat
							region={region}
							timelineLayer={timelineLayer}
							cube={cube.data}
							cubePending={cube.isPending}
							cubeFailed={cube.isError}
							dispIndex={dispIndex}
							terrain={terrain.data}
							source={currentSource}
							cells={pointRows}
							agriZone={selectedAgri ? agriZoneScience(selectedAgri) : null}
							motionZones={motionZones}
							motionRank={motionRank}
							events={events.data ?? []}
							places={region.pois}
						/>
						<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:gap-3">
							<ScienceMenuBar
								items={scienceItems}
								openId={scienceOpen}
								onOpen={setScienceOpen}
								trailing={
									<>
										<Link
											to="/data"
											className="flex h-11 shrink-0 items-center rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm font-semibold text-slate-100 shadow-lg backdrop-blur-md hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
										>
											Datos
										</Link>
										<ControlsHint compact={compact} />
									</>
								}
								headingExtra={{
									punto: inspected
										? `${inspectLat.toFixed(4)}°, ${inspectLon.toFixed(4)}°`
										: undefined,
								}}
								panels={{
									medicion: (
										<LiveMeasurement
											region={region}
											cube={cube.data}
											cubePending={cube.isPending}
											cubeFailed={cube.isError}
											timelineLayer={timelineLayer}
											dispIndex={dispIndex}
											terrain={terrain.data}
											source={currentSource}
										/>
									),
									capas: (
										<LayersMenu
											catalog={catalog}
											active={item}
											onSelect={selectItem}
											displacement={timelineLayer}
											visible={mainUi.visible}
											loading={Boolean(raster) && rasterData.isPending}
											failed={Boolean(raster) && rasterData.isError}
											fieldLimit={fieldLimit}
											zoneCount={zoneData?.zones.length ?? 0}
										/>
									),
									punto: (
										<PointMenu
											inspected={Boolean(inspected)}
											place={
												inspected
													? (nearestPoi(
															region.pois,
															inspected.col,
															inspected.row,
															region.cellSizeM,
														)?.text ?? null)
													: null
											}
											coords={
												inspected
													? `${inspectLat.toFixed(4)}°, ${inspectLon.toFixed(4)}°`
													: null
											}
											rows={pointRows}
										/>
									),
									cultivos: (
										<CropsMenu
											missingCover={!landLayer || landData.isError}
											loading={!landData.data && landData.isPending}
											listed={agriList.listed}
											selected={selectedAgri}
											rejected={compareRejected}
											record={
												selectedAgri ? agriZoneScience(selectedAgri) : null
											}
											moisture={selectedSeries[moistureIndex] ?? null}
											dates={moistureLayer?.dates ?? []}
											activeIndex={moistureIndex}
											selectedSeries={selectedSeries}
											columns={compareColumns.map((column, index) => ({
												...column,
												values: compared.columns[index] ?? column.values,
											}))}
											vegetation={
												selectedAgri && hvLayer
													? vegetationWord(
															selectedAgri.cells,
															asInt16(hvQ.data),
															signalIndex(hvLayer.dates),
															agriPlane,
															hvLayer.scale,
															hvLayer.nodata,
														)
													: null
											}
											change={
												selectedAgri && changeLayer
													? changeWord(
															selectedAgri.cells,
															asBytes(changeQ.data),
															signalIndex(changeLayer.dates),
															agriPlane,
															changeLayer.nodata,
														)
													: null
											}
											disturbance={
												selectedAgri && disturbanceLayer
													? disturbanceWord(
															selectedAgri.cells,
															asBytes(disturbanceQ.data),
															signalIndex(disturbanceLayer.dates),
															agriPlane,
															disturbanceLayer.nodata,
														)
													: null
											}
											water={agriWater}
											onSelect={(id) => {
												setCompareRejected(false);
												setSelectedPoiId(null);
												store.actions.setAgriZone(id);
											}}
											onCompare={(id) => {
												if (state.agriZoneId === null) {
													setCompareRejected(false);
													store.actions.setAgriZone(id);
													return;
												}
												const next = withComparison(
													state.agriZoneId,
													state.agriCompare,
													id,
												);
												setCompareRejected(next.rejected);
												if (!next.rejected)
													store.actions.setAgriCompare(next.extras);
											}}
											onRemove={(id) => {
												setCompareRejected(false);
												store.actions.setAgriCompare(
													state.agriCompare.filter((itemId) => itemId !== id),
												);
											}}
										/>
									),
									eventos: (
										<EventsList
											events={events.data ?? []}
											onSelect={goToEvent}
										/>
									),
									metodo: <MethodMenu />,
									procedencia: (
										<ProvenanceMenu
											region={region}
											layer={raster ?? activeLayer ?? timelineLayer}
										/>
									),
									escena: (
										<SceneMenu
											layerVisible={mainUi.visible}
											onLayerVisible={(visible) =>
												store.actions.setLayerVisible(MAIN_LAYER, visible)
											}
											opacity={mainUi.opacity}
											onOpacity={(value) =>
												store.actions.setLayerOpacity(MAIN_LAYER, value)
											}
											overlays={overlayModels.map((overlay) => ({
												id: overlay.id,
												name: overlay.name,
												on: overlayOn(state, overlay.id),
												km: overlayBands ? overlay.km : null,
											}))}
											onOverlay={store.actions.setOverlay}
											hasWater={Boolean(waterLayer)}
											waterMotion={state.waterMotion}
											onWaterMotion={store.actions.setWaterMotion}
										/>
									),
								}}
							/>

							<div className="min-h-0 flex-1" />
						</div>
					</div>
					{dateCount > 0 && currentDate && (
						<Timeline
							dates={timelineDates}
							index={Math.min(state.dateIndex, dateCount - 1)}
							onSelect={store.actions.selectDate}
							note={
								activeLayer ? timelineNote(view, state.deform3d) : undefined
							}
						/>
					)}
				</div>
			</div>
		</FlightContext.Provider>
	);
}
