import {AbstractComponent, type ComponentClass} from "../components";
import {MapComponent} from "./map";

//

type State = {
    level: HTMLElement,
    map: MapComponent
};

//

export class ZoomComponent extends AbstractComponent<HTMLElement> {

    private _state: State | null = null;

    //

    get requires(): ComponentClass<any>[] {
        // @ts-ignore
        return [MapComponent];
    }

    onMount() {
        const { manager } = this;
        const { plus, minus, level } = this.locate("plus", "minus", "level");

        this._state = {
            level,
            map: manager.get(MapComponent)
        };

        plus.addEventListener("click", () => {
            this._modify(0.5);
        });
        minus.addEventListener("click", () => {
            this._modify(-0.5);
        });
    }

    onRender() {
        const { z } = this._state!.map.location;
        this._updateLevel(z, false);
    }

    private _updateLevel(z: number, set: boolean) {
        const { map, level } = this._state!;
        if (set) {
            const { x, y } = map.location;
            map.location = {x, y, z};
        }
        level.innerText = z.toFixed(1);
    }

    private _modify(m: number) {
        const { map } = this._state!;
        let z = map.location.z + m;
        z = Math.min(Math.max(z, 0), 22);
        this._updateLevel(z, true);
    }

}