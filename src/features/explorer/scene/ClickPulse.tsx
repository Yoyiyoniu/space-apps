import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { type ClickMark, MARK_HOLD_S, pulseFrame } from "./clickMarks";

const BLACK = "#000000";
/** Separación sobre el relieve para que la cruz no pelee con el terreno. */
const LIFT = 0.6;

function Mark({
	mark,
	heightAt,
	reducedMotion,
	onExpire,
}: {
	mark: ClickMark;
	heightAt: (col: number, row: number) => number;
	reducedMotion: boolean;
	onExpire: (id: number) => void;
}) {
	const ring = useRef<THREE.Mesh>(null);
	const expired = useRef(false);

	useFrame(() => {
		const age = (performance.now() - mark.born) / 1000;
		if (!expired.current && age >= MARK_HOLD_S) {
			expired.current = true;
			onExpire(mark.id);
		}
		const mesh = ring.current;
		if (!mesh) return;
		const frame = pulseFrame(age);
		mesh.visible = frame !== null;
		if (!frame) return;
		mesh.scale.setScalar(frame.scale);
		const material = mesh.material;
		if (!Array.isArray(material)) material.opacity = frame.opacity;
	});

	const y = heightAt(mark.col, mark.row) + LIFT;
	return (
		<group position={[mark.col, y, mark.row]}>
			{!reducedMotion && (
				<mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
					<ringGeometry args={[1.14, 1.22, 64]} />
					<meshBasicMaterial
						color={BLACK}
						transparent
						depthWrite={false}
						toneMapped={false}
					/>
				</mesh>
			)}
			<mesh>
				<boxGeometry args={[5, 0.16, 0.42]} />
				<meshBasicMaterial
					color={BLACK}
					toneMapped={false}
					polygonOffset
					polygonOffsetFactor={-2}
					polygonOffsetUnits={-2}
				/>
			</mesh>
			<mesh>
				<boxGeometry args={[0.42, 0.16, 5]} />
				<meshBasicMaterial
					color={BLACK}
					toneMapped={false}
					polygonOffset
					polygonOffsetFactor={-2}
					polygonOffsetUnits={-2}
				/>
			</mesh>
		</group>
	);
}

/** Pulso negro del clic y la cruz que queda en ese punto. Solo dibujo. */
export function ClickPulse({
	marks,
	heightAt,
	reducedMotion,
	onExpire,
}: {
	marks: readonly ClickMark[];
	heightAt: (col: number, row: number) => number;
	reducedMotion: boolean;
	onExpire: (id: number) => void;
}) {
	return (
		<>
			{marks.map((mark) => (
				<Mark
					key={mark.id}
					mark={mark}
					heightAt={heightAt}
					reducedMotion={reducedMotion}
					onExpire={onExpire}
				/>
			))}
		</>
	);
}