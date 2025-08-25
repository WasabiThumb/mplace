import {AbstractComponent} from "../components";

//

const IN_TIME = 0.25;
const HOLD_TIME = 5;
const OUT_TIME = 0.25;

class Controller {

    readonly element: HTMLElement;
    timer: number;

    constructor(element: HTMLElement) {
        this.element = element;
        this.timer = 0;
    }

    render(delta: number): boolean {
        const { element } = this;
        const time = this.timer += delta;

        if (time < IN_TIME) {
            const u = this._ease(time / IN_TIME);
            element.style.transform = `scaleY(${u * 100}%)`;
            element.style.marginBottom = `${-2.138 * (1 - u)}em`;
            element.style.opacity = `${u}`;
        } else if (time < (IN_TIME + HOLD_TIME)) {
            element.style.transform = `scaleY(100%)`;
            element.style.marginBottom = `0%`;
            element.style.opacity = "1";
        } else if (time < (IN_TIME + HOLD_TIME + OUT_TIME)) {
            const u = 1 - this._ease((time - (IN_TIME + HOLD_TIME)) / OUT_TIME);
            element.style.transform = `scaleY(${u * 100}%)`;
            element.style.opacity = `${u}`;
        } else {
            element.style.opacity = "0";
            return false;
        }
        return true;
    }

    private _ease(n: number): number {
        return 3 * n * n - 2 * n * n * n;
    }

}

//

export class AlertsComponent extends AbstractComponent<HTMLElement> {

    private readonly _templates: { [k: string]: HTMLElement } = {};
    private readonly _instances: Controller[] = [];

    //

    onMount() {
        const query =
            this.element.querySelectorAll<HTMLElement>(`[data-template]`);

        for (let i=0; i < query.length; i++) {
            const el = query.item(i);
            const key = el.getAttribute("data-template")!;
            this._templates[key] = el.cloneNode(true) as HTMLElement;
            el.style.display = "none";
        }
    }

    onRender(delta: number) {
        let head: number = 0;
        let next: Controller;

        while (head < this._instances.length) {
            next = this._instances[head]!;
            if (next.render(delta)) {
                head++;
            } else {
                this._instances.splice(head, 1);
                this.element.removeChild(next.element);
            }
        }
    }

    private _show(type: string, message: string) {
        const template = this._templates[type];
        if (!template) {
            console.warn(`No template for alert type ${type}`);
            return;
        }

        const element = template.cloneNode(true) as HTMLElement;
        const content = element.querySelector<HTMLElement>(`[data-role="content"]`);
        if (!!content) content.innerText = message;

        element.style.opacity = "0";
        element.style.transform = "scaleY(0%)";
        this.element.prepend(element);
        this._instances.push(new Controller(element));
    }

    info(message: string) {
        this._show("info", message);
    }

    warn(message: string) {
        this._show("warn", message);
    }

    error(message: string) {
        this._show("error", message);
    }

}
