import { createStore } from "@tanstack/react-store";

export interface LayerUiState {
	visible: boolean;
	opacity: number;
}

export interface ProbeReading {
	col: number;
	row: number;
	lon: number;
	lat: number;
	/** Velocidad de la nave, en celdas por segundo. */
	vx?: number;
	vz?: number;
}

export interface ExplorerState {
	regionId: string;
	/** Estado de UI por `${regionId}/${layerId}`. */
	layers: Record<string, LayerUiState>;
	dateIndex: number;
	playing: boolean;
	probe: ProbeReading | null;
	warping: boolean;
	/** Lo que muestra el mapa; una sola vista a la vez. */
	mapView: MapView;
	/** Punto tocado en el mapa para el inspector, en coordenadas de grilla. */
	inspected: { col: number; row: number } | null;
	/** Superposiciones vectoriales apagadas por el usuario; por defecto están encendidas. */
	overlays: Record<string, boolean>;
	settingsOpen: boolean;
	eventsOpen: boolean;
	/** Hundimiento 3D siempre encendido, factor fijo ×2000. */
	deform3d: boolean;
	deformFactor: DeformFactor;
	/** Oleaje y ondas; la extensión del agua cambia con la fecha de todos modos. */
	waterMotion: boolean;
	contextOpen: boolean;
	creditsOpen: boolean;
	agriZoneId: number | null;
	/** Otras zonas en la comparación; la elegida ocupa el primer lugar. */
	agriCompare: number[];
}

export type MapView =
	| "cumulative"
	| "velocity"
	| "zones"
	| "differential"
	| "acceleration"
	| `layer:${string}`;
export const DEFORM_FACTOR = 2000;
export type DeformFactor = typeof DEFORM_FACTOR;

export const DEFAULT_LAYER: LayerUiState = { visible: true, opacity: 0.85 };
/** Antes de conocer el largo de la serie, la fecha activa es la última. */
export const LAST_DATE_INDEX = Number.MAX_SAFE_INTEGER;

export const initialExplorerState = (regionId = "mexicali"): ExplorerState => ({
	regionId,
	layers: {},
	dateIndex: LAST_DATE_INDEX,
	playing: true,
	probe: null,
	warping: false,
	mapView: "cumulative",
	inspected: null,
	overlays: {},
	settingsOpen: false,
	eventsOpen: false,
	deform3d: true,
	deformFactor: DEFORM_FACTOR,
	waterMotion: true,
	contextOpen: false,
	creditsOpen: false,
	agriZoneId: null,
	agriCompare: [],
});

export const layerKey = (regionId: string, layerId: string) =>
	`${regionId}/${layerId}`;

export function createExplorerStore(initial = initialExplorerState()) {
	return createStore(initial, ({ setState, get }) => ({
		setRegion(regionId: string) {
			if (get().regionId === regionId) return;
			// la nueva región tiene otras fechas: se reinicia la línea de tiempo
			setState((s) => ({
				...s,
				regionId,
				dateIndex: LAST_DATE_INDEX,
				playing: true,
				probe: null,
				inspected: null,
				agriZoneId: null,
				agriCompare: [],
			}));
		},
		setLayerVisible(layerId: string, visible: boolean) {
			setState((s) => {
				const key = layerKey(s.regionId, layerId);
				const prev = s.layers[key] ?? DEFAULT_LAYER;
				return { ...s, layers: { ...s.layers, [key]: { ...prev, visible } } };
			});
		},
		setLayerOpacity(layerId: string, opacity: number) {
			setState((s) => {
				const key = layerKey(s.regionId, layerId);
				const prev = s.layers[key] ?? DEFAULT_LAYER;
				const clamped = Math.min(1, Math.max(0, opacity));
				return {
					...s,
					layers: { ...s.layers, [key]: { ...prev, opacity: clamped } },
				};
			});
		},
		/** Selección manual en el slider: pausa la reproducción. */
		selectDate(index: number) {
			setState((s) => ({
				...s,
				dateIndex: Math.max(0, Math.round(index)),
				playing: false,
			}));
		},
		/** Avance automático (en bucle) durante la reproducción. */
		advanceDate(dateCount: number) {
			setState((s) => {
				if (dateCount <= 0) return s;
				const current = Math.min(s.dateIndex, dateCount - 1);
				return { ...s, dateIndex: (current + 1) % dateCount };
			});
		},
		setPlaying(playing: boolean) {
			setState((s) => ({ ...s, playing }));
		},
		setProbe(probe: ProbeReading | null) {
			setState((s) => (sameProbe(s.probe, probe) ? s : { ...s, probe }));
		},
		setMapView(mapView: MapView) {
			setState((s) => ({ ...s, mapView }));
		},
		/** Cambia de capa llevando la línea de tiempo a la fecha equivalente. */
		setView(mapView: MapView, dateIndex: number) {
			setState((s) => ({ ...s, mapView, dateIndex: Math.max(dateIndex, 0) }));
		},
		setInspected(inspected: { col: number; row: number } | null) {
			setState((s) => ({ ...s, inspected }));
		},
		setEventsOpen(eventsOpen: boolean) {
			setState((s) => ({
				...s,
				eventsOpen,
				contextOpen: eventsOpen ? false : s.contextOpen,
				creditsOpen: eventsOpen ? false : s.creditsOpen,
			}));
		},
		setSettingsOpen(settingsOpen: boolean) {
			setState((s) => ({ ...s, settingsOpen }));
		},
		setOverlay(id: string, on: boolean) {
			setState((s) => ({ ...s, overlays: { ...s.overlays, [id]: on } }));
		},
		setWaterMotion(waterMotion: boolean) {
			setState((s) => ({ ...s, waterMotion }));
		},
		setWarping(warping: boolean) {
			setState((s) => ({ ...s, warping }));
		},
		setContextOpen(contextOpen: boolean) {
			setState((s) => ({
				...s,
				contextOpen,
				eventsOpen: contextOpen ? false : s.eventsOpen,
				creditsOpen: contextOpen ? false : s.creditsOpen,
			}));
		},
		setCreditsOpen(creditsOpen: boolean) {
			setState((s) => ({
				...s,
				creditsOpen,
				eventsOpen: creditsOpen ? false : s.eventsOpen,
				contextOpen: creditsOpen ? false : s.contextOpen,
			}));
		},
		setAgriZone(agriZoneId: number | null) {
			setState((s) => ({
				...s,
				agriZoneId,
				agriCompare: s.agriCompare.filter((id) => id !== agriZoneId),
			}));
		},
		setAgriCompare(agriCompare: number[]) {
			setState((s) => ({ ...s, agriCompare }));
		},
	}));
}

export type ExplorerStore = ReturnType<typeof createExplorerStore>;

export const explorerStore = createExplorerStore();

export const overlayOn = (state: ExplorerState, id: string) =>
	state.overlays[id] !== false;

const sameProbe = (a: ProbeReading | null, b: ProbeReading | null) => {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.col === b.col &&
		a.row === b.row &&
		a.lon === b.lon &&
		a.lat === b.lat &&
		a.vx === b.vx &&
		a.vz === b.vz
	);
};

/** Huella de UI sin la sonda: la nave publica el probe a 10 Hz y no debe remontar el mapa. */
export function viewFingerprint(s: ExplorerState) {
	return [
		s.regionId,
		s.dateIndex,
		s.mapView,
		s.deform3d ? 1 : 0,
		s.deformFactor,
		s.waterMotion ? 1 : 0,
		s.agriZoneId ?? "",
		s.agriCompare.join(","),
		s.playing ? 1 : 0,
		s.warping ? 1 : 0,
		s.inspected ? `${s.inspected.col},${s.inspected.row}` : "",
		JSON.stringify(s.layers),
		JSON.stringify(s.overlays),
	].join("|");
}

export function layerUi(state: ExplorerState, layerId: string): LayerUiState {
	return state.layers[layerKey(state.regionId, layerId)] ?? DEFAULT_LAYER;
}
