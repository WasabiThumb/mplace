import {AbstractComponent, type ComponentClass} from "../components";
import {MapComponent} from "./map";
import {Coordinates} from "../util/mercator";
import {AlertsComponent} from "./alerts";

//

type State = {
    coordsElement: HTMLElement,
    map: MapComponent,
    alerts: AlertsComponent
};

//

export class StatsComponent extends AbstractComponent<HTMLElement> {

    private _state: State | null = null;

    //

    get requires(): ComponentClass<any>[] {
        // @ts-ignore
        return [MapComponent, AlertsComponent];
    }

    onMount() {
        const coordsElement =
            this.element.querySelector<HTMLElement>(`[data-role="coords"]`);

        const copyCoordsElement =
            this.element.querySelector<HTMLElement>(`[data-role="copy-coords"]`);

        if (!coordsElement || !copyCoordsElement)
            throw new Error("Missing required elements");

        this._state = {
            coordsElement,
            map: this.manager.get(MapComponent),
            alerts: this.manager.get(AlertsComponent)
        };

        copyCoordsElement.addEventListener("pointerdown", () => {
            this._copy();
        });
    }

    onRender() {
        const { coordsElement, map } = this._state!;
        coordsElement.innerText = Coordinates.format(map.coordinates);
    }

    private _copy() {
        const { coordsElement, alerts } = this._state!;
        const text = coordsElement.innerText;
        navigator.clipboard.writeText(text)
            .then(() => {
                alerts.info("Copied to clipboard!")
            })
            .catch((e) => {
                console.error(e);
                alerts.error("Failed to copy to clipboard");
            });
    }

}