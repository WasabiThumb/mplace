import {AbstractComponent} from "../components";
import {RasterLoader, type RasterStats} from "../util/raster";
import {Config} from "../util/config";
import {Coordinates} from "../util/mercator";
import type {Location} from "../util/location";

//

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

const LOADING_LUT_SIZE = 43;
const LOADING_LUT: number[] = new Array(LOADING_LUT_SIZE);
for (let i=0; i < LOADING_LUT_SIZE; i++) {
    LOADING_LUT[i] = Math.random() * Math.PI * 2;
}

//

type Move = {
    /** Target X location in normalized world coordinates */
    worldX: number,

    /** Target Y location in normalized world coordinates */
    worldY: number,

    /** Target X location in normalized screen coordinates */
    screenX: number,

    /** Target Y location in normalized screen coordinates */
    screenY: number,

    /** Target Z */
    zoom: number
};

type State = {
    /** For render operations */
    readonly ctx: CanvasRenderingContext2D,

    /** Loads images used by the render process */
    readonly loader: RasterLoader,

    /** Current width of the canvas */
    width: number,

    /** Current height of the canvas */
    height: number,

    /** Current location */
    location: Location,

    /** Current move */
    activeMove: Move | null,

    /** Running sum for time-based effects */
    timer: number
};

//

export class MapComponent extends AbstractComponent<HTMLCanvasElement> {

    private _state: State | null = null;
    private _isPainted: boolean = false;
    private _paintListeners: (() => void)[] = [];

    //

    get captures(): boolean {
        return true;
    }

    get location(): Location {
        return { ...this._state!.location };
    }

    set location(l: Location) {
        this._state!.location = { ...l };
    }

    get coordinates(): Coordinates {
        let { x, y } = this._state!.location;

        // Round to appropriate granularity & clamp to world bounds
        const dim = 2048000;
        const pixelX = Math.min(Math.max(Math.floor(x * dim), 0), dim - 1);
        const pixelY = Math.min(Math.max(Math.floor(y * dim), 0), dim - 1);
        x = pixelX / dim;
        y = pixelY / dim;

        // Web mercator projection (reversed)
        let lng = 2 * Math.PI * (x - 0.5);
        let lat = 2 * Math.atan(Math.pow(Math.E, Math.PI - 2 * Math.PI * y)) - 0.5 * Math.PI;

        // Convert to degrees
        return Coordinates.of(
            lat * RAD2DEG,
            lng * RAD2DEG
        );
    }

    get rasterStats(): RasterStats {
        return this._state!.loader.stats;
    }

    onMount() {
        const { element } = this;
        const ctx = element.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2D rendering context");

        this._state = {
            ctx: ctx,
            loader: new RasterLoader(),
            width: 0,
            height: 0,
            location: {
                x: Config.get("lastKnownX"),
                y: Config.get("lastKnownY"),
                z: Config.get("lastKnownZ")
            },
            activeMove: null,
            timer: 0
        };
        this._updateMetrics();
        setTimeout(() => {
            this._updateMetrics();
        }, 50);
    }

    onRender(delta: number) {
        this._handleMovement(delta);
        const { ctx, loader, width, height, location } = this._state!;
        const { x, y, z } = location;

        let { timer } = this._state!;
        this._state!.timer = timer += delta;

        // Clear out the canvas
        ctx.clearRect(0, 0, width, height);

        // Calculate the box of the full world map, then transform such that it fits in [0, 1)
        const { dim, ox, oy, minX, minY, maxX, maxY } = this._calcBackgroundRect(width, height, x, y, z);
        ctx.transform(dim, 0, 0, dim, ox, oy);

        // Draw the background, trying further and further zoom levels until
        // the entire background is filled
        const bgOpacity = Config.get("backgroundOpacity");
        if (bgOpacity > 0) {
            ctx.globalCompositeOperation = "destination-over";
            ctx.imageSmoothingEnabled = true;
            const targetZoom: number = Math.min(Math.ceil(z + 1.51), 20);
            for (let zoom: number = targetZoom; zoom >= 0; zoom--) {
                if (this._drawBackground(ctx, loader, minX, minY, maxX, maxY, zoom)) {
                    this._markPainted();
                    break;
                }
            }
            if (bgOpacity < 255) {
                ctx.globalCompositeOperation = "destination-out";
                ctx.fillStyle = `rgba(255, 255, 255, ${1 - (bgOpacity / 255)})`;
                ctx.fillRect(0, 0, 1, 1);
            }
        }
        ctx.globalCompositeOperation = "source-over";

        // Draw the foreground
        const fgOpacity = Config.get("foregroundOpacity");
        if (fgOpacity > 0) {
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = fgOpacity / 255;
            if (z >= Config.get("foregroundZ")) {
                this._drawForeground(ctx, loader, minX, minY, maxX, maxY, z, timer);
            }
        }
        ctx.globalAlpha = 1;

        // Undo the transform from before
        ctx.resetTransform();

        // Collect old rasters
        loader.collect();
    }

    onResize() {
        this._updateMetrics();
    }

    onZoom(n: number, cx: number, cy: number) {
        const state = this._state!;
        const { width, height, location } = state;
        const { x, y, z } = location;

        const rect = this._calcBackgroundRect(width, height, x, y, z);
        const screenX = cx / width;
        const screenY = cy / height;
        const worldX = rect.minX + ((rect.maxX - rect.minX) * screenX);
        const worldY = rect.minY + ((rect.maxY - rect.minY) * screenY);

        state.activeMove = {
            worldX, worldY,
            screenX, screenY,
            zoom: Math.max(z + 10 * n, 0)
        };
    }

    onDrag(dx: number, dy: number) {
        const state = this._state!;
        const dim = Math.round(Math.max(state.width, state.height) * Math.pow(2, state.location.z));
        const clamp = ((n: number) => Math.max(Math.min(n, 1), 0));
        state.location = {
            x: clamp(state.location.x - (dx / dim)),
            y: clamp(state.location.y - (dy / dim)),
            z: state.location.z
        };
        this._finalizeMovement();
    }

    private _updateMetrics() {
        const { element } = this;
        const state = this._state!;
        const rect = element.getBoundingClientRect();
        state.width = element.width = Math.floor(rect.width);
        state.height = element.height = Math.floor(rect.height);
    }

    private _handleMovement(delta: number): void {
        const { width, height, location, activeMove } = this._state!;
        if (!activeMove) return;

        const u1 = Math.min(delta * 5, 1);
        const u2 = Math.min(delta * 3, 1);
        const v1 = 1 - u1;
        const v2 = 1 - u2;

        let targetX = (v1 * location.x) + (u1 * activeMove.worldX);
        let targetY = (v1 * location.y) + (u1 * activeMove.worldY);
        let targetZ = (v2 * location.z) + (u2 * activeMove.zoom);

        if (targetZ !== location.z && activeMove.screenX !== 0.5 && activeMove.screenY !== 0.5) {
            // Zoom compensation
            const srcRect = this._calcBackgroundRect(
                width, height,
                location.x,
                location.y,
                location.z
            );
            const dstRect = this._calcBackgroundRect(
                width, height,
                targetX,
                targetY,
                targetZ
            );
            const srcCursorX = srcRect.minX + ((srcRect.maxX - srcRect.minX) * activeMove.screenX);
            const srcCursorY = srcRect.minY + ((srcRect.maxY - srcRect.minY) * activeMove.screenY);
            const dstCursorX = dstRect.minX + ((dstRect.maxX - dstRect.minX) * activeMove.screenX);
            const dstCursorY = dstRect.minY + ((dstRect.maxY - dstRect.minY) * activeMove.screenY);
            targetX += srcCursorX - dstCursorX;
            targetY += srcCursorY - dstCursorY;
        }

        const clamp = ((n: number) => Math.max(Math.min(n, 1), 0));
        targetX = clamp(targetX);
        targetY = clamp(targetY);

        this._state!.location = {
            x: targetX,
            y: targetY,
            z: targetZ
        };

        const mag = Math.pow(targetX - location.x, 2) +
            Math.pow(targetY - location.y, 2) +
            Math.pow(targetZ - location.z, 2);

        if (mag <= 0.00001) {
            this._finalizeMovement();
        }
    }

    private _drawBackground(
        ctx: CanvasRenderingContext2D,
        loader: RasterLoader,
        minX: number, minY: number,
        maxX: number, maxY: number,
        zoom: number
    ): boolean {
        const worldSize = 1 << zoom;
        const tileResolution = 256;
        let minTileX = Math.floor(minX * worldSize);
        let minTileY = Math.floor(minY * worldSize);
        let maxTileX = Math.floor(maxX * worldSize);
        let maxTileY = Math.floor(maxY * worldSize);
        let all: boolean = true;

        const tileWidth = maxTileX - minTileX + 1;
        const tileHeight = maxTileY - minTileY + 1;

        // An offscreen canvas is used to prevent rounding artifacts
        const temp = new OffscreenCanvas(tileWidth * tileResolution, tileHeight * tileResolution);
        const tempCtx = temp.getContext("2d")!;
        tempCtx.imageSmoothingEnabled = false;

        // Check bounds on tile indices
        if (minTileX < 0) {
            if (maxTileX < 0) return true;
            minTileX = 0;
        }
        if (minTileY < 0) {
            if (maxTileY < 0) return true;
            minTileY = 0;
        }
        if (maxTileX >= worldSize) {
            if (minTileX >= worldSize) return true;
            maxTileX = worldSize - 1;
        }
        if (maxTileY >= worldSize) {
            if (minTileY >= worldSize) return true;
            maxTileY = worldSize - 1;
        }

        for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
            for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
                const raster = loader.get(
                    "https://tile.openstreetmap.org/" + zoom + "/" + tileX + "/" + tileY + ".png",
                    Config.get("backgroundDownscaling")
                );
                if (!raster) {
                    all = false;
                    continue;
                }
                tempCtx.drawImage(
                    raster.bitmap,
                    (tileX - minTileX) * tileResolution,
                    (tileY - minTileY) * tileResolution,
                    tileResolution,
                    tileResolution
                );
            }
        }

        ctx.drawImage(
            temp,
            minTileX / worldSize,
            minTileY / worldSize,
            tileWidth / worldSize,
            tileHeight / worldSize
        );
        return all;
    }

    private _drawForeground(
        ctx: CanvasRenderingContext2D,
        loader: RasterLoader,
        minX: number, minY: number,
        maxX: number, maxY: number,
        zoom: number, timer: number
    ): void {
        const worldSize = 2048;
        let minTileX = Math.floor(minX * worldSize);
        let minTileY = Math.floor(minY * worldSize);
        let maxTileX = Math.floor(maxX * worldSize);
        let maxTileY = Math.floor(maxY * worldSize);

        // Check bounds on tile indices
        if (minTileX < 0) {
            if (maxTileX < 0) return;
            minTileX = 0;
        }
        if (minTileY < 0) {
            if (maxTileY < 0) return;
            minTileY = 0;
        }
        if (maxTileX >= worldSize) {
            if (minTileX >= worldSize) return;
            maxTileX = worldSize - 1;
        }
        if (maxTileY >= worldSize) {
            if (minTileY >= worldSize) return;
            maxTileY = worldSize - 1;
        }

        // Determine an appropriate refresh period
        let refreshInterval: number;
        if (zoom >= 10) {
            refreshInterval = 5000;
        } else {
            refreshInterval = 625 * zoom * zoom -
                23750 * zoom +
                180000;
        }
        const now = window.performance.now();

        for (let tileY=minTileY; tileY <= maxTileY; tileY++) {
            for (let tileX=minTileX; tileX <= maxTileX; tileX++) {
                const raster = loader.get(
                    "https://backend.wplace.live/files/s0/tiles/" + tileX + "/" + tileY + ".png",
                    Config.get("foregroundDownscaling")
                );

                if (!raster) {
                    // Draw loading graphic
                    const index = ((tileY * worldSize) + tileX);
                    const phase = LOADING_LUT[index % LOADING_LUT_SIZE]!;
                    const speed = 4.5 + LOADING_LUT[(index * 3) % LOADING_LUT_SIZE]!;
                    const opacity = 0.25 + 0.125 * Math.cos(speed * timer + phase);
                    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
                    ctx.fillRect(
                        tileX / worldSize,
                        tileY / worldSize,
                        1 / worldSize,
                        1 / worldSize
                    );
                    continue;
                }

                // TODO: Uncomment
                // const age = now - raster.lastUpdated;
                // if (age >= refreshInterval) raster.markDirty();

                ctx.drawImage(
                    raster.bitmap,
                    tileX / worldSize,
                    tileY / worldSize,
                    1 / worldSize,
                    1 / worldSize
                );
            }
        }
    }

    private _finalizeMovement() {
        const { location } = this._state!;
        this._state!.activeMove = null;
        Config.set("lastKnownX", location.x);
        Config.set("lastKnownY", location.y);
        Config.set("lastKnownZ", location.z);
    }

    private _calcBackgroundRect(
        width: number,
        height: number,
        x: number,
        y: number,
        z: number
    ): { dim: number, ox: number, oy: number, minX: number, minY: number, maxX: number, maxY: number } {
        const dim = Math.round(Math.max(width, height) * Math.pow(2, z));
        const ox = (width / 2) - (dim * x);
        const oy = (height / 2) - (dim * y);

        const minX = -ox / dim;
        const minY = -oy / dim;
        const maxX = (width - ox) / dim;
        const maxY = (height - oy) / dim;

        return { dim, ox, oy, minX, minY, maxX, maxY };
    }

    whenPainted(callback: () => void): void {
        if (this._isPainted) {
            callback();
        } else {
            this._paintListeners.push(callback);
        }
    }

    private _markPainted(): void {
        if (this._isPainted) return;
        this._isPainted = true;
        for (let cb of this._paintListeners.splice(0)) {
            cb();
        }
    }

    moveTo(coordinates: Coordinates, zoom: number = 10): void {
        let { longitude, latitude } = coordinates;

        // Degrees to radians
        longitude *= DEG2RAD;
        latitude *= DEG2RAD;

        // Web mercator projection
        const x = (Math.PI + longitude) / (2 * Math.PI);
        const y = (Math.PI - Math.log(Math.tan(Math.PI / 4 + latitude / 2))) / (2 * Math.PI);

        // Make the move
        this._state!.activeMove = {
            worldX: x,
            worldY: y,
            screenX: 0.5,
            screenY: 0.5,
            zoom
        };
    }

}
