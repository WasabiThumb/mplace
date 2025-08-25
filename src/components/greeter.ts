import {AbstractComponent, type ComponentClass} from "../components";
import {MapComponent} from "./map";

//

type State = {
    enabled: boolean,
    timer: number,
    ready: boolean,
    flipElement: HTMLElement
};

const TIME_FLIP = 0.5;
const TIME_HOLD = 0.25;
const TIME_FADE = 0.5;

const TAGLINES = [
    "Lacking in sauce.",
    "Removed herobrine.",
    "Slightly higher uptime!",
    "Protected by nimbusblaze!",
    "Still no moderation.",
    "Made with ❤️ by Xavier!",
    "What does the M stand for?"
];

//

export class GreeterComponent extends AbstractComponent<HTMLElement> {

    private _state: State | null = null;

    //

    get requires(): ComponentClass<any>[] {
        // @ts-ignore
        return [MapComponent];
    }

    onMount() {
        const flipElement =
            this.element.querySelector<HTMLElement>(`[data-role="flip"]`);

        const taglineElement =
            this.element.querySelector<HTMLElement>(`[data-role="tagline"]`);

        if (!flipElement || !taglineElement)
            throw new Error("Missing required elements");

        // Set tagline
        taglineElement.innerText = TAGLINES[Math.floor(Math.random() * TAGLINES.length)]!;

        this._state = {
            enabled: true,
            timer: 0,
            ready: false,
            flipElement
        };

        const map: MapComponent = this.manager.get(MapComponent);
        map.whenPainted(() => {
            this._state!.ready = true;
        });
    }

    onRender(delta: number) {
        const state = this._state!;
        if (!state.enabled) return;

        const el = state.flipElement;
        let timer: number = state.timer;
        timer += delta;

        const flip = timer / TIME_FLIP;
        if (flip < 0.5) {
            const turn = 0.5 * Math.cos(2 * Math.PI * flip) + 0.5;
            el.style.transform = `scaleY(${turn * 100}%)`;
        } else {
            if (flip < 1) {
                const turn = 0.5 * Math.cos(2 * Math.PI * flip) + 0.5;
                el.style.transform = `scaleY(${turn * 100}%)`;
            } else {
                el.style.removeProperty("transform");
            }
            el.innerText = "m";
        }

        if (timer >= (TIME_FLIP + TIME_HOLD)) {
            if (!state.ready) {
                state.timer = TIME_FLIP + TIME_HOLD;
                return;
            }
            const { element } = this;
            element.style.pointerEvents = "none";
            const prog = (timer - (TIME_FLIP + TIME_HOLD)) / TIME_FADE;
            if (prog > 1) {
                element.style.display = "none";
                state.enabled = false;
            } else {
                const opacity = Math.pow(1 - prog, 2);
                this.element.style.opacity = `${opacity}`;
            }
        }

        state.timer = timer;
    }

}
