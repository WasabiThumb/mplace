import {Config} from "./config";
import {randomUUID} from "./uuid";
import {Preconditions} from "./preconditions";

/**
 * Exclusive access to a
 * loaded image. May self-update
 * if loaded as "hot"
 */
export interface Raster {
    readonly url: string;
    readonly bitmap: ImageBitmap;
    readonly lastUpdated: number;
    readonly lastUsed: number;
    markDirty(): void;
}

//

/** @internal */
class RasterImpl implements Raster {

    private static F_OPEN: number = 1;
    private static F_READY: number = 2;
    private static F_AWAITING: number = 4;

    //

    private readonly _downscale: number;
    private _flags: number;
    private _tempTag: HTMLImageElement | null;
    private _bitmap: ImageBitmap | null;
    private _lastUpdate: number;
    private _lastUsage: number;
    private _used: boolean;

    constructor(
        readonly url: string,
        downscale: number
    ) {
        this._downscale = downscale;
        this._flags = RasterImpl.F_OPEN;
        this._tempTag = null;
        this._bitmap = null;
        this._lastUpdate = 0;
        this._lastUsage = 0;
        this._used = false;
        this._makeRequest();
    }

    //

    private _checkOpen(): void {
        if (!(this._flags & RasterImpl.F_OPEN)) {
            throw new Error("Illegal attempt to use raster after collection");
        }
    }

    private _checkReady(): void {
        if (!(this._flags & RasterImpl.F_READY)) {
            throw new Error("Illegal attempt to use raster before ready");
        }
    }

    private _makeRequest(): void {
        if (!(this._flags & RasterImpl.F_OPEN)) return;
        const start = window.performance.now();

        const controller = new AbortController();
        const tag = new Image();
        this._resetTag(tag);
        this._flags |= RasterImpl.F_AWAITING;

        tag.addEventListener("load", () => {
            controller.abort();

            let options: ImageBitmapOptions | undefined = undefined;
            const downscale = this._downscale;
            if (downscale !== 0) {
                options = {
                    resizeWidth: tag.naturalWidth >> downscale,
                    resizeHeight: tag.naturalHeight >> downscale
                };
            }

            createImageBitmap(tag, options).then((bmp) => {
                this._finishRequest(start, true, bmp);
            }).catch((e) => {
                console.warn("Failed to create bitmap from image element", e);
                this._finishRequest(start, false, null);
            })
        }, { signal: controller.signal });

        tag.addEventListener("error", () => {
            controller.abort();
            this._finishRequest(start, false, null);
        }, { signal: controller.signal });

        if (this._flags & RasterImpl.F_READY) {
            tag.fetchPriority = "low";
            tag.src = `${this.url}?token=${randomUUID()}`;
        } else {
            tag.fetchPriority = "high";
            tag.src = this.url;
        }
    }

    private _finishRequest<S extends boolean>(
        startTime: number,
        success: S,
        value: S extends true ? ImageBitmap : any
    ): void {
        if (!(this._flags & RasterImpl.F_OPEN)) return;
        const now = window.performance.now();

        this._resetTag(null);
        if (success) {
            this._resetBitmap(value);
            this._lastUpdate = now;
            this._flags |= RasterImpl.F_READY;
            this._flags &= (~RasterImpl.F_AWAITING);
            return;
        }

        const elapsed = now - startTime;
        const delay = Config.get("rasterRetryDelay");
        if (elapsed >= delay) {
            this._makeRequest();
        } else {
            setTimeout(() => {
                this._makeRequest();
            }, delay - elapsed);
        }
    }

    touch(): void {
        this._lastUsage = window.performance.now();
        this._used = true;
    }

    isReady(): boolean {
        this._checkOpen();
        return !!(this._flags & RasterImpl.F_READY);
    }

    isUpdating(): boolean {
        this._checkOpen();
        return !!(this._flags & RasterImpl.F_READY) && !!(this._flags & RasterImpl.F_AWAITING);
    }

    get bitmap(): ImageBitmap {
        this._checkReady();
        return this._bitmap!;
    }

    get lastUpdated(): number {
        this._checkReady();
        return this._lastUpdate;
    }

    get lastUsed(): number {
        this._checkOpen();
        return this._lastUsage;
    }

    checkUsed() {
        if (this._used) {
            this._used = false;
            return true;
        }
        return false;
    }

    markDirty() {
        console.log("attempt to mark dirty");
        this._checkOpen();
        if (this._flags & RasterImpl.F_AWAITING) return;
        this._makeRequest();
    }

    destroy() {
        this._checkOpen();
        this._flags &= (~RasterImpl.F_OPEN);
        this._resetBitmap(null);
        this._resetTag(null);
    }

    private _resetBitmap(replacement: ImageBitmap | null) {
        const bitmap = this._bitmap;
        if (!!bitmap) bitmap.close();
        this._bitmap = replacement;
    }

    private _resetTag(replacement: HTMLImageElement | null) {
        const tag = this._tempTag;
        if (!!tag) tag.src = "";
        this._tempTag = replacement;
    }

}

//

export type RasterStats = {
    /** Number of rasters tracked */
    readonly total: number,

    /** Number of rasters not yet loaded */
    readonly loading: number,

    /** Number of rasters being updated */
    readonly updating: number,

    /** Fraction of rasters used as of last frame */
    readonly used: number
};

//

export class RasterLoader {

    private readonly _map: { [p: string]: RasterImpl };
    private _used: number;

    constructor() {
        this._map = {};
        this._used = 0;
    }

    //

    get stats(): RasterStats {
        let total: number = 0;
        let loading: number = 0;
        let updating: number = 0;

        for (let v of Object.values(this._map)) {
            if (v.isReady()) {
                if (v.isUpdating()) updating++;
            } else {
                loading++;
            }
            total++;
        }

        return Object.freeze({
            total, loading, updating,
            used: this._used
        });
    }

    private _getUnsafe(url: string, downscale: number): RasterImpl {
        let ret = this._map[url];
        if (!ret) this._map[url] = ret = new RasterImpl(url, downscale);
        return ret;
    }

    get(url: string, downscale: number = 0): Raster | null {
        Preconditions.intRange(downscale, 0, 9, "downscale");
        const raster = this._getUnsafe(url, downscale);
        raster.touch();
        if (raster.isReady()) return raster;
        return null;
    }

    collect(): void {
        const now = window.performance.now();
        const threshold = Config.get("rasterTimeToLive");
        const keys = Object.keys(this._map);
        let usedCount: number = 0;
        let totalCount: number = 0;

        for (let key of keys) {
            const raster = this._map[key]!;

            totalCount++;
            if (raster.checkUsed()) {
                usedCount++;
                continue;
            }

            const age = now - raster.lastUsed;
            if (age > threshold) {
                raster.destroy();
                delete this._map[key];
            }
        }

        this._used = usedCount / totalCount;
    }

}
