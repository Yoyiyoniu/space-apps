import { describe, expect, it } from "vitest";
import {
	createExplorerStore,
	LAST_DATE_INDEX,
	layerUi,
	overlayOn,
	viewFingerprint,
} from "./store";

describe("explorer store", () => {
	it("cambiar de región reinicia la línea de tiempo", () => {
		const store = createExplorerStore();
		store.actions.selectDate(5);
		store.actions.setProbe({ col: 1, row: 1, lon: 0, lat: 0 });
		store.actions.setRegion("tijuana");
		expect(store.state).toMatchObject({
			regionId: "tijuana",
			dateIndex: LAST_DATE_INDEX,
			probe: null,
		});
	});

	it("elegir una fecha cambia el índice", () => {
		const store = createExplorerStore();
		store.actions.selectDate(3);
		expect(store.state.dateIndex).toBe(3);
	});

	it("visibilidad y opacidad por capa y región", () => {
		const store = createExplorerStore();
		expect(layerUi(store.state, "subsidence").visible).toBe(true);
		store.actions.setLayerVisible("subsidence", false);
		store.actions.setLayerOpacity("subsidence", 4);
		expect(layerUi(store.state, "subsidence")).toEqual({
			visible: false,
			opacity: 1,
		});
		store.actions.setRegion("tijuana");
		expect(layerUi(store.state, "subsidence").visible).toBe(true);
	});

	it("cambiar de capa lleva la fecha y el inspector se limpia al cambiar de región", () => {
		const store = createExplorerStore();
		store.actions.setView("layer:hh", 3);
		store.actions.setInspected({ col: 1, row: 2 });
		expect(store.state).toMatchObject({ mapView: "layer:hh", dateIndex: 3 });
		store.actions.setRegion("tijuana");
		expect(store.state.inspected).toBeNull();
	});

	it("caminos y canales están encendidos hasta que se apagan", () => {
		const store = createExplorerStore();
		expect(overlayOn(store.state, "roads")).toBe(true);
		store.actions.setOverlay("roads", false);
		expect(overlayOn(store.state, "roads")).toBe(false);
		store.actions.setOverlay("roads", true);
		expect(overlayOn(store.state, "roads")).toBe(true);
	});

	it("el agua se anima por defecto y se puede apagar", () => {
		const store = createExplorerStore();
		expect(store.state.waterMotion).toBe(true);
		store.actions.setWaterMotion(false);
		expect(store.state.waterMotion).toBe(false);
	});

	it("elegir una zona agrícola no cambia la vista de movimiento", () => {
		const store = createExplorerStore();
		store.actions.setMapView("velocity");
		store.actions.setAgriZone(4);
		store.actions.setAgriCompare([1, 2]);
		expect(store.state.mapView).toBe("velocity");
		expect(store.state.agriZoneId).toBe(4);
		store.actions.setAgriZone(1);
		expect(store.state.agriCompare).toEqual([2]);
		expect(store.state.mapView).toBe("velocity");
	});

	it("modos de análisis", () => {
		const store = createExplorerStore();
		expect(store.state).toMatchObject({
			mapView: "cumulative",
			deform3d: true,
			deformFactor: 2000,
		});
		store.actions.setMapView("zones");
		store.actions.setRegion("tijuana");
		expect(store.state).toMatchObject({
			mapView: "zones",
			deform3d: true,
			deformFactor: 2000,
		});
	});

	it("la sonda no cambia la huella de vista ni reescribe el store si no se movió", () => {
		const store = createExplorerStore();
		const before = viewFingerprint(store.state);
		store.actions.setProbe({ col: 1, row: 2, lon: 0, lat: 0, vx: 0, vz: 0 });
		expect(viewFingerprint(store.state)).toBe(before);
		const probe = store.state.probe;
		store.actions.setProbe({ col: 1, row: 2, lon: 0, lat: 0, vx: 0, vz: 0 });
		expect(store.state.probe).toBe(probe);
	});
});
