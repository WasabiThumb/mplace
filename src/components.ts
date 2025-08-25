
/**
 * An object which is bound to
 * a DOM element
 */
export type Component<E extends HTMLElement> = {
    readonly element: E;
    readonly captures: boolean;
    readonly requires: ComponentClass<any>[];
    onMount(): void;
    onRender(delta: number): void;
    onResize(): void;
    onZoom(n: number, cx: number, cy: number): void;
    onDrag(dx: number, dy: number): void;
};

export abstract class AbstractComponent<E extends HTMLElement> implements Component<E> {

    constructor(
        protected readonly manager: ComponentManager,
        readonly element: E
    ) { }

    //

    get captures(): boolean {
        return false;
    }

    get requires(): ComponentClass<any>[] {
        return [];
    }

    onMount(): void { }

    onRender(delta: number): void { }

    onResize(): void { }

    onZoom(n: number, cx: number, cy: number): void { }

    onDrag(dx: number, dy: number): void { }

    protected locate<R extends string>(...roles: R[]): Record<R, HTMLElement> {
        const { element } = this;
        const ret: { [k: string]: HTMLElement } = {};

        for (let role of roles) {
            const child = element.querySelector<HTMLElement>(`[data-role="${role}"]`);
            if (!child) throw new Error(`Missing required element \"${role}\" for ${this.constructor.name}`);
            ret[role] = child;
        }

        return ret as unknown as Record<R, HTMLElement>;
    }

}

export type ComponentClass<T extends Component<any>> = {
    new(manager: ComponentManager, element: T extends Component<infer E> ? E : never): T;
};

export class ComponentManager {

    private readonly _registry: Record<string, Component<any>[]>;

    constructor() {
        this._registry = {};
        this._setupSharedEvents();
    }

    //

    find<T extends Component<any>, C extends ComponentClass<T>>(clazz: C): T[] {
        return (this._registry[clazz.name] || []) as unknown as T[];
    }

    get<T extends Component<any>, C extends ComponentClass<T>>(clazz: C): T {
        const arr = this._registry[clazz.name];
        if (!arr || arr.length === 0) {
            throw new Error(`No ${clazz.name} component is registered`);
        }
        if (arr.length !== 1) {
            throw new Error(`Multiple ${clazz.name} components are registered`);
        }
        return arr[0] as unknown as T;
    }

    mount<C extends Component<any>>(
        clazz: ComponentClass<C>,
        element: C extends Component<infer E> ? E : never
    ): C {
        const instance = new clazz(this, element);

        // Check requirements
        const { requires } = instance;
        for (let cls of requires) {
            if (!this._registry[cls.name]) {
                throw new Error(`${clazz.name} declares dependency on ${cls.name} (none registered)`);
            }
        }

        // Mount
        try {
            instance.onMount();
            this._setupInstancedEvents(instance);
        } catch (e) {
            throw new Error(`Failed to mount ${clazz.name}`, { cause: e });
        }

        // Add to registry
        let arr: Component<any>[] | undefined = this._registry[clazz.name];
        if (!arr) this._registry[clazz.name] = arr = [];
        arr.push(instance);

        return instance;
    }

    private _setupSharedEvents() {
        // onRender
        let lastRender = window.performance.now();
        const frame = (() => {
            const now = window.performance.now();
            const elapsed = (now - lastRender) / 1000;
            lastRender = now;
            this._each("onRender", elapsed);
            window.requestAnimationFrame(frame);
        });
        window.requestAnimationFrame(frame);

        // onResize
        window.addEventListener("resize", () => {
            this._each("onResize");
        });
    }

    private _setupInstancedEvents(c: Component<any>) {
        const element = c.element as unknown as HTMLElement;

        // onZoom
        element.addEventListener("wheel", (e) => {
            const box = element.getBoundingClientRect();
            c.onZoom(
                ("wheelDelta" in e ? e["wheelDelta"] as number : e.deltaY) / window.innerHeight,
                e.clientX - box.left,
                e.clientY - box.top
            );
        });

        // Mouse & touch
        type Pointer = { readonly id: number, x: number, y: number };
        const pointers: Record<number, Pointer> = {};
        const captured: Set<number> = new Set();
        function getPointer<C extends boolean, R extends C extends true ? Pointer : Pointer | null>(
            e: PointerEvent,
            create: C
        ): R {
            const id = e.pointerId;
            let pointer: Pointer | undefined = pointers[id];
            if (!pointer) {
                if (!create) return null as unknown as R;
                pointer = { id, x: e.screenX, y: e.screenY };
                pointers[id] = pointer;
            }
            return pointer as unknown as R;
        }

        element.addEventListener("pointerdown", (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            const pointer = getPointer(e, true);
            if (c.captures) {
                element.setPointerCapture(pointer.id);
                captured.add(pointer.id);
            }
        });
        element.addEventListener("pointermove", (e) => {
            const pointer = getPointer(e, false);
            if (!pointer) return;
            if (captured.has(pointer.id)) {
                if (captured.size === 1) {
                    // Drag
                    c.onDrag(
                        e.screenX - pointer.x,
                        e.screenY - pointer.y
                    );
                } else if (captured.size === 2) {
                    // Pinch
                    const arr = [...captured];
                    const other = pointers[arr[1 - arr.indexOf(pointer.id)]!]!;

                    const cx = (pointer.x + other.x) / 2;
                    const cy = (pointer.y + other.y) / 2;

                    const odx = pointer.x - cx;
                    const ody = pointer.y - cy;
                    const od = Math.sqrt((odx * odx) + (ody * ody));

                    const ndx = e.screenX - cx;
                    const ndy = e.screenY - cy;
                    const nd = Math.sqrt((ndx * ndx) + (ndy * ndy));

                    c.onZoom((nd - od) / 25, cx, cy);
                }
            }
            pointer.x = e.screenX;
            pointer.y = e.screenY;
        });
        element.addEventListener("pointerup", (e) => {
            const pointer = getPointer(e, false);
            if (!pointer) return;
            if (captured.delete(pointer.id)) element.releasePointerCapture(pointer.id);
            delete pointers[pointer.id];
        });
    }

    private _each<K extends keyof Component<any>>(
        method: K,
        ...args: Parameters<Component<any>[K]>
    ) {
        for (let arr of Object.values(this._registry)) {
            for (let component of arr) {
                (component[method] as unknown as Function)
                    .apply(component, args);
            }
        }
    }

}
