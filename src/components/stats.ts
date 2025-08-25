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
        const { coords, copyCoords } = this.locate("coords", "copyCoords");

        this._state = {
            coordsElement: coords,
            map: this.manager.get(MapComponent),
            alerts: this.manager.get(AlertsComponent)
        };

        copyCoords.addEventListener("pointerdown", () => {
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