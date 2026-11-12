/**
 * Camera state for the 3D View window (P3.2, ui.md UI-3). This is the
 * contract between the camera rig (`CameraRig.tsx`) and the overlay (P3.3).
 * The overlay uses only these fields:
 *
 * - `activeCameraId`: the kit camera the view is at or flying to, or null
 *   after the viewer orbits, pans, zooms or picks a seat. Highlight its chip.
 * - `selectCamera(id)`: fly to one of the listed cameras
 *   (`useView3dSceneStore().cameras`, in menu order). Ids not listed are
 *   ignored.
 * - `pickMode` and `setPickMode(on)`: pick-a-seat. While on, the canvas shows
 *   a crosshair and the next click on a stand moves there; the rig turns it
 *   off after one pick or on Esc. An Esc keydown that cancels pick mode is
 *   `preventDefault()`ed, so a fullscreen Esc handler can skip events with
 *   `defaultPrevented`.
 * - `markActive(id)`: the view is already at camera `id` (it was just saved
 *   there), so highlight it without flying.
 * - `lookAt(position, target)`: fly to any view, such as one framing a prop. Clears the
 *   active camera.
 * - `currentPose()`: the view right now (eye, look-at point, field of
 *   view), for saving it as a camera. Null before the rig mounts.
 *
 * Fields starting with `_` are for the rig only.
 */
import { create } from "zustand";
import { useView3dSceneStore } from "../sceneStore";
import type { ViewPose } from "@/view3d/core/cameraList";

/** A pending fly-to a free view. `seq` changes on every request. */
export interface LookRequest {
    position: [number, number, number];
    target: [number, number, number];
    seq: number;
}

/** A pending fly-to. `seq` changes on every request, even for the same id. */
export interface CameraRequest {
    id: string;
    seq: number;
}

export interface CameraState {
    activeCameraId: string | null;
    selectCamera: (id: string) => void;
    pickMode: boolean;
    setPickMode: (on: boolean) => void;
    markActive: (id: string) => void;
    lookAt: (
        position: [number, number, number],
        target: [number, number, number],
    ) => void;
    currentPose: () => ViewPose | null;
    /** Rig only: sets where `currentPose` reads from. */
    _setPoseSource: (source: (() => ViewPose) | null) => void;
    /** Rig only: the latest `selectCamera` call. */
    _request: CameraRequest | null;
    /** Rig only: the latest `lookAt` call. */
    _look: LookRequest | null;
    /** Rig only. */
    _setActive: (id: string | null) => void;
}

let poseSource: (() => ViewPose) | null = null;

export const useCameraStore = create<CameraState>()((set, get) => ({
    activeCameraId: null,
    selectCamera: (id) => {
        const { kit, cameras } = useView3dSceneStore.getState();
        if (kit && !cameras.some((c) => c.id === id)) return;
        set({
            activeCameraId: id,
            pickMode: false,
            _request: { id, seq: (get()._request?.seq ?? 0) + 1 },
        });
    },
    pickMode: false,
    setPickMode: (on) => set({ pickMode: on }),
    markActive: (id) => set({ activeCameraId: id, pickMode: false }),
    lookAt: (position, target) =>
        set({
            activeCameraId: null,
            pickMode: false,
            _look: { position, target, seq: (get()._look?.seq ?? 0) + 1 },
        }),
    currentPose: () => poseSource?.() ?? null,
    _setPoseSource: (source) => {
        poseSource = source;
    },
    _request: null,
    _look: null,
    _setActive: (id) => set({ activeCameraId: id }),
}));
