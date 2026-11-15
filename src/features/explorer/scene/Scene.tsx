import { AdaptiveDpr, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { KeyAxes } from "../controls/useKeyboard";
import type { Palette } from "../lib/colormap";
import type { Ejido } from "../lib/ejidos";
import { gridToLonLat } from "../lib/grid";
import type { Zone } from "../lib/impact";
import type { Feature } from "../lib/infrastructure";
import type { CropId, MapModel } from "../lib/mapModels";
import type { Layer, Region } from "../manifest";
import type { ExplorerStore } from "../store";
import { AgriculturalOutline } from "./AgriculturalOutline";
import { EjidoMarkers } from "./EjidoMarkers";
import { EjidoOutlines } from "./EjidoOutlines";
import { useFlight } from "./flight";
import { Infrastructure } from "./Infrastructure";
import { IsoCamera } from "./IsoCamera";
import { createLayerUniforms, type PaintModeValue } from "./layerMaterial";
import { MapModels } from "./MapModels";
import { MotionArrows } from "./MotionArrows";
import { PoiMarkers } from "./PoiMarkers";
import { Ship } from "./Ship";
import { Terrain, type WaterData } from "./Terrain";
import { ZoneMarkers } from "./ZoneMarkers";

const PROBE_INTERVAL_S = 0.1;

/** Publica la posición de la nave al store ~10 veces por segundo (para la sonda). */
function ProbePublisher({
	region,
	store,
	enabled,
}: {
	region: Region;
	store: ExplorerStore;
	enabled: boolean;
}) {
	const flight = useFlight();
	const acc = useRef(0);
	const last = useRef({ col: -1, row: -1, moving: false });
	useFrame((_, dt) => {
		if (!enabled) return;
		acc.current += dt;
		if (acc.current < PROBE_INTERVAL_S) return;
		acc.current = 0;
		const col = Math.round(flight.col * 10) / 10;
		const row = Math.round(flight.row * 10) / 10;
		const moving = Math.hypot(flight.vx, flight.vz) >= 0.5;
		// detenida no hay nada nuevo que publicar, salvo el momento en que se detiene
		if (
			col === last.current.col &&
			row === last.current.row &&
			moving === last.current.moving
		) {
			return;
		}
		last.current = { col, row, moving };
		const [lon, lat] = gridToLonLat(region, flight.col, flight.row);
		store.actions.setProbe({
			col: flight.col,
			row: flight.row,
			lon,
			lat,
			vx: flight.vx,
			vz: flight.vz,
		});
	});
	return null;
}

export interface SceneProps {
	region: Region;
	heights: Int16Array;
	exaggeration: number;
	step: number;
	layer: Layer | null;
	cube: Int16Array | null;
	layerVisible: boolean;
	layerOpacity: number;
	dateIndex: number;
	reducedMotion: boolean;
	heightAt: (col: number, row: number) => number;
	/** Altura sin hundimiento 3D: las cintas lo aplican en el shader. */
	baseHeightAt: (col: number, row: number) => number;
	paintMode: PaintModeValue;
	field: Float32Array | null;
	fieldLimit: number;
	fieldMin: number;
	palette: Palette;
	bands: Uint8Array | null;
	bandPalette: string[];
	contour: boolean;
	overlays: Array<{
		id: string;
		kind: "road" | "canal" | "river";
		features: Feature[];
		flags: Uint8Array;
	}>;
	/** Campo este-oeste cuando esa capa está activa, para dibujar flechas. */
	arrows: Float32Array | null;
	zones: Zone[];
	/** Celdas de la zona agrícola elegida; el contorno es solo de esa zona. */
	agriCells: number[] | null;
	/** Máscara de cultivo sobre el terreno. null la apaga. */
	agriMask: Uint8Array | null;
	mapModels: MapModel[];
	/** Cultivo del diagrama que debe verse más grande. */
	modelFocus: CropId | null;
	cityMask: Uint8Array | null;
	cityLive: boolean;
	zoneLabels: React.RefObject<Map<string, HTMLElement>>;
	deformScale: number;
	deformCube: Float32Array | null;
	water: WaterData | null;
	waterMotion: boolean;
	keys: React.RefObject<KeyAxes>;
	labels: React.RefObject<Map<string, HTMLElement>>;
	ejidos: Ejido[];
	ejidoLabels: React.RefObject<Map<string, HTMLElement>>;
	store: ExplorerStore;
	publishProbe: boolean;
}

export function Scene(props: SceneProps) {
	const { region } = props;
	const uniforms = useMemo(createLayerUniforms, []);
	return (
		<>
			<color attach="background" args={["#05070f"]} />
			<AdaptiveDpr pixelated />
			<Stars
				radius={600}
				depth={200}
				count={900}
				factor={6}
				fade
				speed={props.reducedMotion ? 0 : 0.4}
			/>
			<hemisphereLight args={["#cfe3ff", "#3b2a1f", 0.75]} />
			<directionalLight
				position={[-300, 420, 160]}
				intensity={2.1}
				color="#fff1dc"
			/>
			<IsoCamera
				regionSize={Math.max(region.width, region.height)}
				reducedMotion={props.reducedMotion}
			/>
			<Terrain
				region={region}
				heights={props.heights}
				exaggeration={props.exaggeration}
				step={props.step}
				layer={props.layer}
				cube={props.cube}
				visible={props.layerVisible}
				opacity={props.layerOpacity}
				dateIndex={props.dateIndex}
				reducedMotion={props.reducedMotion}
				paintMode={props.paintMode}
				field={props.field}
				fieldLimit={props.fieldLimit}
				fieldMin={props.fieldMin}
				palette={props.palette}
				bands={props.bands}
				bandPalette={props.bandPalette}
				contour={props.contour}
				deformScale={props.deformScale}
				deformCube={props.deformCube}
				uniforms={uniforms}
				water={props.water}
				waterMotion={props.waterMotion}
				agriMask={props.agriMask}
				cityMask={props.cityMask}
				cityLive={props.cityLive}
			/>
			<PoiMarkers
				pois={region.pois}
				heightAt={props.heightAt}
				labels={props.labels}
			/>
			{props.overlays.map((o) => (
				<Infrastructure
					key={o.id}
					features={o.features}
					kind={o.kind}
					flags={o.flags}
					baseHeightAt={props.baseHeightAt}
					terrain={uniforms}
				/>
			))}
			{props.ejidos.length > 0 && (
				<EjidoOutlines ejidos={props.ejidos} heightAt={props.heightAt} />
			)}
			<EjidoMarkers
				ejidos={props.ejidos}
				heightAt={props.heightAt}
				labels={props.ejidoLabels}
			/>
			{props.arrows && (
				<MotionArrows
					field={props.arrows}
					width={region.width}
					height={region.height}
					limit={props.fieldLimit}
					heightAt={props.heightAt}
				/>
			)}
			{props.agriCells && (
				<AgriculturalOutline
					cells={props.agriCells}
					width={region.width}
					height={region.height}
					heightAt={props.heightAt}
					reducedMotion={props.reducedMotion}
				/>
			)}
			<ZoneMarkers
				zones={props.zones}
				heightAt={props.heightAt}
				labels={props.zoneLabels}
			/>
			<MapModels
				models={props.mapModels}
				heightAt={props.heightAt}
				focus={props.modelFocus}
			/>
			<Ship keys={props.keys} reducedMotion={props.reducedMotion} />
			<ProbePublisher
				region={region}
				store={props.store}
				enabled={props.publishProbe}
			/>
		</>
	);
}
