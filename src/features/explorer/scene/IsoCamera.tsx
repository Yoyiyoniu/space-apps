import { OrthographicCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { pickTerrain } from "../lib/pick";
import { aimAt, useFlight } from "./flight";
import { MAP_SCALE } from "./terrainGeometry";

// Isométrico verdadero: azimut 45°, elevación atan(1/√2) ≈ 35.264°.
const AZIMUTH = Math.PI / 4;
const ELEVATION = Math.atan(1 / Math.SQRT2);
const DISTANCE = 900;
const OFFSET = new THREE.Vector3(
	Math.cos(ELEVATION) * Math.sin(AZIMUTH),
	Math.sin(ELEVATION),
	Math.cos(ELEVATION) * Math.cos(AZIMUTH),
).multiplyScalar(DISTANCE);

const VIEW_DIR = OFFSET.clone().normalize().negate();

/** Celdas visibles en el ancho de la pantalla: límites del zoom. */
const MIN_CELLS = 40 / MAP_SCALE;
const DEFAULT_CELLS = 170 / MAP_SCALE;
const CLICK_TOLERANCE_PX = 6;

interface IsoCameraProps {
	regionSize: number;
	reducedMotion: boolean;
	onPick: (col: number, row: number) => void;
}

export function IsoCamera({
	regionSize,
	reducedMotion,
	onPick,
}: IsoCameraProps) {
	const pickRef = useRef(onPick);
	pickRef.current = onPick;
	const flight = useFlight();
	const cam = useRef<THREE.OrthographicCamera>(null);
	const target = useRef(new THREE.Vector3());
	const goal = useRef(new THREE.Vector3());
	const { size, gl } = useThree();
	const limits = useRef({ min: 1, max: 10 });
	const zoomGoal = useRef(1);

	// Límites de zoom según el tamaño de la región y del viewport.
	useEffect(() => {
		const c = cam.current;
		if (!c) return;
		const span = Math.min(size.width, size.height * 1.6);
		limits.current = {
			min: span / (regionSize * 1.5), // ver toda la región
			max: span / MIN_CELLS,
		};
		c.zoom = THREE.MathUtils.clamp(
			span / DEFAULT_CELLS,
			limits.current.min,
			limits.current.max,
		);
		zoomGoal.current = c.zoom;
		c.updateProjectionMatrix();
	}, [size.width, size.height, regionSize]);

	// Rueda y pellizco.
	useEffect(() => {
		const el = gl.domElement;
		// Los eventos solo fijan el zoom objetivo; la cámara lo alcanza suavemente en useFrame.
		const apply = (factor: number) => {
			zoomGoal.current = THREE.MathUtils.clamp(
				zoomGoal.current * factor,
				limits.current.min,
				limits.current.max,
			);
		};
		const pick = (clientX: number, clientY: number) => {
			const c = cam.current;
			if (!c) return;
			const rect = el.getBoundingClientRect();
			const ndc = new THREE.Vector3(
				((clientX - rect.left) / rect.width) * 2 - 1,
				-((clientY - rect.top) / rect.height) * 2 + 1,
				-1,
			);
			const origin = ndc.unproject(c);
			const hit = pickTerrain(
				origin,
				VIEW_DIR,
				flight.heightAt,
				flight.width,
				flight.height,
				DISTANCE * 2.5,
			);
			if (hit) {
				aimAt(flight, hit.col, hit.row);
				pickRef.current(hit.col, hit.row);
			}
		};
		let down: { x: number; y: number; multi: boolean } | null = null;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			apply(Math.exp(-e.deltaY * 0.0015));
		};
		const pointers = new Map<number, { x: number; y: number }>();
		let lastDist = 0;
		const dist = () => {
			const [a, b] = [...pointers.values()];
			return Math.hypot(a.x - b.x, a.y - b.y);
		};
		const onDown = (e: PointerEvent) => {
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pointers.size === 1)
				down = { x: e.clientX, y: e.clientY, multi: false };
			if (pointers.size === 2) {
				lastDist = dist();
				if (down) down.multi = true;
			}
		};
		const onMove = (e: PointerEvent) => {
			if (!pointers.has(e.pointerId)) return;
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pointers.size === 2) {
				const d = dist();
				if (lastDist > 0) apply(d / lastDist);
				lastDist = d;
			}
		};
		const onUp = (e: PointerEvent) => {
			pointers.delete(e.pointerId);
			lastDist = 0;
			// clic/tap = soltar sin arrastre y sin pellizco
			if (
				e.type === "pointerup" &&
				pointers.size === 0 &&
				down &&
				!down.multi
			) {
				const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
				if (moved <= CLICK_TOLERANCE_PX) pick(e.clientX, e.clientY);
			}
			if (pointers.size === 0) down = null;
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		el.addEventListener("pointerdown", onDown);
		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerup", onUp);
		el.addEventListener("pointercancel", onUp);
		return () => {
			el.removeEventListener("wheel", onWheel);
			el.removeEventListener("pointerdown", onDown);
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerup", onUp);
			el.removeEventListener("pointercancel", onUp);
		};
	}, [gl, flight]);

	useFrame((state, dt) => {
		const c = cam.current;
		if (!c) return;
		goal.current.set(flight.col, flight.y, flight.row);
		if (reducedMotion || flight.snap) {
			target.current.copy(goal.current);
			flight.snap = false;
		} else
			target.current.lerp(goal.current, 1 - Math.exp(-5 * Math.min(dt, 0.1)));
		c.position.copy(target.current).add(OFFSET);
		c.lookAt(target.current);
		const dz = zoomGoal.current - c.zoom;
		if (Math.abs(dz) > zoomGoal.current * 1e-4) {
			state.performance.regress();
			c.zoom = reducedMotion
				? zoomGoal.current
				: c.zoom + dz * (1 - Math.exp(-12 * Math.min(dt, 0.1)));
			c.updateProjectionMatrix();
		}
	});

	return (
		<OrthographicCamera ref={cam} makeDefault near={1} far={DISTANCE * 3} />
	);
}
