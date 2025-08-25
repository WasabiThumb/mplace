import {AbstractComponent, type ComponentClass} from "../components";
import {type ModalID, ModalsComponent} from "./modals";
import {MapComponent} from "./map";
import {AlertsComponent} from "./alerts";
import {CompactLocation} from "../util/location";

//

type ModalTool = {
    id: string,
    action: "modal",
    modal: ModalID
};

type ShareTool = {
    id: string,
    action: "share"
};

type Tool = ModalTool | ShareTool;

const TOOLS: Tool[] = [
    {
        id: "settings",
        action: "modal",
        modal: "settings"
    },
    {
        id: "navigate",
        action: "modal",
        modal: "navigate"
    },
    {
        id: "share",
        action: "share"
    }
];

//

export class ToolsComponent extends AbstractComponent<HTMLElement> {

    private _state: {
        alerts: AlertsComponent,
        modals: ModalsComponent,
        map: MapComponent
    } | null = null;

    //

    get requires(): ComponentClass<any>[] {
        // @ts-ignore
        return [ModalsComponent, MapComponent];
    }

    onMount() {
        const alerts: AlertsComponent = this.manager.get(AlertsComponent);
        const modals: ModalsComponent = this.manager.get(ModalsComponent);
        const map: MapComponent = this.manager.get(MapComponent);
        this._state = { alerts, modals, map };

        for (let tool of TOOLS) {
            const el = this.locate(tool.id)[tool.id]!;
            el.addEventListener("pointerdown", () => {
                this._useTool(tool);
            });
        }
    }

    private _useTool(tool: Tool) {
        if (tool.action === "modal") {
            const { modals } = this._state!;
            modals.open(tool.modal);
        } else if (tool.action === "share") {
            const { alerts, map } = this._state!;
            const at = CompactLocation.encode(map.location) as string;
            const url = new URL(window.location.href);
            url.search = `at=${at}`;
            const urlString = url.href;

            navigator.clipboard.writeText(urlString)
                .then(() => {
                    alerts.info("Copied URL to clipboard!");
                })
                .catch((e) => {
                    console.error(e);
                    alerts.warn("Failed to copy URL to clipboard");
                });
        }
    }

}
