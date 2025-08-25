import {AbstractComponent, type ComponentClass} from "../components";
import {MapComponent} from "./map";

//

type State = {
    map: MapComponent,
    total: HTMLElement,
    loading: HTMLElement,
    updating: HTMLElement,
    usage: HTMLElement
}

//

export class DebugComponent extends AbstractComponent<HTMLElement> {

    private _state: State | null = null;

    get requires(): ComponentClass<any>[] {
        // @ts-ignore
        return [ MapComponent ];
    }

    onMount() {
        const { total, loading, updating, usage, version } = this.locate("total", "loading", "updating", "usage", "version");
        version.innerText = `${__VERSION__}`;
        this._state = {
            map: this.manager.get(MapComponent),
            total,
            loading,
            updating,
            usage
        };
    }

    onRender() {
        const { map, total, loading, updating, usage } = this._state!;
        const stats = map.rasterStats;

        total.innerText = `${stats.total}`;
        loading.innerText = `${stats.loading}`;
        updating.innerText = `${stats.updating}`;
        usage.innerText = `${(stats.used * 100).toFixed(2)}%`;
    }

}
