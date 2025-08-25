import {AbstractComponent, type ComponentClass} from "../components";
import {Config, type ConfigKey} from "../util/config";
import {MapComponent} from "./map";
import {AlertsComponent} from "./alerts";
import {Coordinates} from "../util/mercator";

//

class SettingsModalComponent extends AbstractComponent<HTMLElement> {

    private static KEYS: ConfigKey[] = [
        "rasterTimeToLive",
        "backgroundOpacity",
        "foregroundOpacity",
        "foregroundZ",
        "backgroundDownscaling",
        "foregroundDownscaling"
    ];

    //

    private readonly _entries: {[k: string]: { key: ConfigKey, control: HTMLInputElement, display: HTMLElement }} = {};

    //

    onMount() {
        const { element } = this;
        for (let key of SettingsModalComponent.KEYS) {
            const control = element.querySelector<HTMLInputElement>(`[data-controls="${key}"]`);
            const display = element.querySelector<HTMLElement>(`[data-display="${key}"]`);
            if (!control || !display) throw new Error(`Missing element(s) for setting: ${key}`);
            const cur = `${Config.get(key)}`;
            control.value = cur;
            display.innerText = cur;
            this._entries[key] = { key, control, display };
            control.addEventListener("change", () => {
                this._update()
            });
        }
    }

    private _update(): void {
        for (const entry of Object.values(this._entries)) {
            const { key, control, display } = entry;
            const value = parseInt(control.value);
            display.innerText = `${value}`;
            Config.set(key, value);
        }
    }

}

class NavigateModalComponent extends AbstractComponent<HTMLElement> {

    private _state: {
        map: MapComponent,
        alerts: AlertsComponent,
        query: HTMLInputElement,
        results: HTMLElement,
        template: HTMLElement,
        loadController: AbortController | null
    } | null = null;

    //

    get requires(): ComponentClass<any>[] {
        // @ts-ignore
        return [ AlertsComponent, MapComponent ];
    }

    onMount() {
        const { element } = this;
        const { query, results } = this.locate("query", "results");
        const template = results.querySelector<HTMLElement>(`[data-template]`);
        if (!template) throw new Error("Failed to locate template element");

        this._state = {
            map: this.manager.get(MapComponent),
            alerts: this.manager.get(AlertsComponent),
            query: query as HTMLInputElement,
            results,
            template: template.cloneNode(true) as HTMLElement,
            loadController: null
        };
        template.style.display = `none`;

        const submit = element.querySelector<HTMLButtonElement>(`[data-role="submit"]`);
        if (!!submit) {
            submit.addEventListener("click", () => {
                this._startLoading();
            });
        }
        query.addEventListener("keydown", (e) => {
            if (e.code === "Enter" || e.which === 13) {
                this._startLoading()
            }
        });
    }

    private _startLoading() {
        const state = this._state!;
        const { results } = state;

        // Cancel any previous load
        const oldController = state.loadController;
        if (!!oldController) {
            oldController.abort();
            state.loadController = null;
        }

        // Clear results
        results.innerHTML = "";

        // Get search query
        const query = state.query.value;
        if (!query) return;

        // Skip the search if it represents exact coordinates
        let coords: Coordinates | null = null;
        try {
            coords = Coordinates.parse(query);
        } catch (ignored) { }

        if (!!coords) {
            this._finishLoading([
                {
                    display_name: query,
                    lat: coords.latitude,
                    lon: coords.longitude }
            ]);
            return;
        }

        // Make the search
        state.alerts.info("Starting search...");

        const params = new URLSearchParams();
        params.set("q", query);
        params.set("format", "jsonv2");

        const controller = new AbortController();
        state.loadController = controller;

        fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "mplace; xpedraza542@gmail.com"
            },
            signal: controller.signal
        }).then((r) => r.json())
            .then((r) => this._finishLoading(r))
            .catch((e) => {
                console.error(e);
                state.alerts.error("Search failed, see console for details");
            });
    }

    private _finishLoading(response: any) {
        type Result = { display_name: string, lat: string, lon: string };
        const data = response as unknown as Result[];
        const { results, template, map, alerts } = this._state!;

        if (data.length === 0) {
            alerts.warn("No results found!");
            return;
        }

        for (let result of data) {
            const el = template.cloneNode(true) as HTMLElement;
            const coordinates = Coordinates.of(
                parseFloat(result.lat),
                parseFloat(result.lon)
            );

            const title = el.querySelector<HTMLElement>(`[data-role="title"]`);
            if (!!title) title.innerText = result.display_name;

            const location = el.querySelector<HTMLElement>(`[data-role="location"]`);
            if (!!location) location.innerText = Coordinates.format(coordinates);

            results.appendChild(el);

            const go = el.querySelector<HTMLButtonElement>(`[data-role="go"]`);
            if (!!go) {
                go.addEventListener("click", () => {
                    map.moveTo(coordinates, 14);
                });
            }
        }
    }

}

export type ModalID = "settings" | "navigate";
const MODALS: { [k in ModalID]: ComponentClass<any> } = {
    "settings": SettingsModalComponent,
    "navigate": NavigateModalComponent
};

//

export class ModalsComponent extends AbstractComponent<HTMLElement> {

    private readonly _elements: { [k in ModalID]?: HTMLElement } = {};
    private _visibility: number = 0;
    private _targetVisibility: number = 0;

    onMount() {
        const { element } = this;
        const backdropElement =
            element.querySelector<HTMLElement>(`[data-role="backdrop"]`);
        const contentElement =
            element.querySelector<HTMLElement>(`[data-role="content"]`);
        if (!backdropElement || !contentElement)
            throw new Error("Missing required elements");

        for (const id of Object.keys(MODALS)) {
            const el = element.querySelector<HTMLElement>(`[data-modal="${id}"]`);
            if (!el) throw new Error(`Missing "${id}" modal element`);
            el.style.display = "none";
            this._elements[id as ModalID] = el;
            this.manager.mount(MODALS[id as ModalID], el);
        }

        contentElement.addEventListener("pointerdown", (e) => {
            e.stopImmediatePropagation();
        });
        backdropElement.addEventListener("pointerdown", () => {
            this._targetVisibility = 0;
        });
        this._applyStyles(0);
    }

    onRender(delta: number) {
        const target = this._targetVisibility;
        if (target !== this._visibility) {
            const u = Math.min(delta * 10, 1);
            const v = 1 - u;

            let newVisibility = v * this._visibility + u * target;
            if (Math.abs(newVisibility - target) < 0.005) newVisibility = target;
            this._visibility = newVisibility;
            this._applyStyles(newVisibility);
        }
    }

    open(modal: ModalID): void {
        let ok: boolean = false;
        for (const key of Object.keys(this._elements)) {
            const element = this._elements[key as ModalID]!;
            if (key === modal) {
                ok = true;
                element.style.removeProperty("display");
            } else {
                element.style.display = "none";
            }
        }
        if (!ok) throw new Error(`Invalid modal ID: ${modal}`);
        this._targetVisibility = 1;
    }

    private _applyStyles(visibility: number) {
        const { element } = this;
        if (visibility >= 0.5) {
            element.style.removeProperty("pointer-events");
        } else {
            element.style.pointerEvents = "none";
        }
        element.style.opacity = `${visibility}`;
    }

}
