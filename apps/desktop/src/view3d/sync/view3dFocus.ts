/**
 * The editor's "View in 3D" for a prop: brings up the 3D View and has it fly to the prop
 * (`view3d:focus`). With the window closed, it opens it and sends the request when the window
 * says hello (`useView3dPublisher`), so the request isn't lost while it loads.
 */
import { useView3dWindowStore } from "@/stores/View3dWindowStore";
import { VIEW3D_FOCUS_CHANNEL, type View3dFocus } from "./protocol";

let pending: View3dFocus | null = null;

/** Sends the waiting request, if any. The publisher calls it on the window's hello. */
export function flushView3dFocus(): void {
    if (!pending) return;
    window.electron.publishToView3d(VIEW3D_FOCUS_CHANNEL, pending);
    pending = null;
}

export function viewPropIn3d(marcherId: number): void {
    pending = { marcherId };
    // Opens the window, or brings an open one to the front
    void window.electron.openView3d();
    if (useView3dWindowStore.getState().open) flushView3dFocus();
}
