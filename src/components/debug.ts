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
        const { element } = this;
        const total = element.querySelector<HTMLElement>(`[data-role="total"]`);
        const loading = element.querySelector<HTMLElement>(`[data-role="loading"]`);
        const updating = element.querySelector<HTMLElement>(`[data-role="updating"]`);
        const usage = element.querySelector<HTMLElement>(`[data-role="usage"]`);
        const version = element.querySelector<HTMLElement>(`[data-role="version"]`);
        if (!total || !loading || !updating || !usage || !version) throw new Error("Missing required elements");

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
