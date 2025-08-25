import './main.css';
import {ComponentManager} from "./components";
import {MapComponent} from "./components/map";
import {StatsComponent} from "./components/stats";
import {DebugComponent} from "./components/debug";
import {GreeterComponent} from "./components/greeter";
import {AlertsComponent} from "./components/alerts";
import {ModalsComponent} from "./components/modals";
import {ToolsComponent} from "./components/tools";
import {ZoomComponent} from "./components/zoom";
import {CompactLocation, type Location} from "./util/location";

// Mount components
const manager = new ComponentManager();
manager.mount(
    AlertsComponent,
    document.querySelector("#alerts")!
);
manager.mount(
    MapComponent,
    document.querySelector("#map")!
);
manager.mount(
    GreeterComponent,
    document.querySelector("#greeter")!
);
manager.mount(
    ModalsComponent,
    document.querySelector("#modals")!
);
manager.mount(
    StatsComponent,
    document.querySelector("#stats")!
);
manager.mount(
    DebugComponent,
    document.querySelector("#debug")!
);
manager.mount(
    ToolsComponent,
    document.querySelector("#tools")!
);
manager.mount(
    ZoomComponent,
    document.querySelector("#zoom")!
);

// Parse the ?at URL parameter
const map: MapComponent = manager.get(MapComponent);
const params = new URLSearchParams(window.location.search);
((at) => {
    if (!at) return;
    let location: Location;
    try {
        location = CompactLocation.decode(at as CompactLocation);
    } catch (e) {
        console.warn("Failed to decode \"at\" parameter", e);
        return;
    }
    map.location = location;
})(params.get("at"));
