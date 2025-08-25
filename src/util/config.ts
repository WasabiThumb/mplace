import {Preconditions} from "./preconditions";

// Types & Initializers

export type ConfigMap = {
    rasterTimeToLive: number,
    rasterRetryDelay: number,
    foregroundZ: number,
    lastKnownX: number,
    lastKnownY: number,
    lastKnownZ: number,
    backgroundOpacity: number,
    foregroundOpacity: number,
    backgroundDownscaling: number,
    foregroundDownscaling: number
};

const DEFAULTS: ConfigMap = {
    rasterTimeToLive: 10000,
    rasterRetryDelay: 1000,
    foregroundZ: 8,
    lastKnownX: 0.5,
    lastKnownY: 0.5,
    lastKnownZ: 0,
    backgroundOpacity: 255,
    foregroundOpacity: 255,
    backgroundDownscaling: 0,
    foregroundDownscaling: 0
};

export type ConfigKey = keyof ConfigMap;

// Codecs

interface Codec<V> {
    serialize(value: V): string;
    deserialize(value: string): V;
}

const IntCodec = new class implements Codec<number> {
    serialize(value: number): string {
        Preconditions.int(value);
        return `${value}`;
    }
    deserialize(value: string): number {
        return parseInt(value);
    }
}

const OctetCodec = new class implements Codec<number> {
    serialize(value: number): string {
        Preconditions.int(value);
        const c = ((n: number) => n < 0xA ? (0x30 + n) : (0x57 + n));
        return String.fromCharCode(c((value >> 4) & 0xF), c(value & 0xF));
    }
    deserialize(value: string): number {
        return parseInt(value, 16);
    }
}

const FloatCodec = new class implements Codec<number> {
    serialize(value: number): string {
        return `${value}`;
    }
    deserialize(value: string): number {
        return parseFloat(value);
    }
};

type CodecMap = {
    [K in ConfigKey]: Codec<ConfigMap[K]>
};

const CODECS: CodecMap = {
    rasterTimeToLive: IntCodec,
    rasterRetryDelay: IntCodec,
    foregroundZ: FloatCodec,
    lastKnownX: FloatCodec,
    lastKnownY: FloatCodec,
    lastKnownZ: FloatCodec,
    backgroundOpacity: OctetCodec,
    foregroundOpacity: OctetCodec,
    backgroundDownscaling: IntCodec,
    foregroundDownscaling: IntCodec
};

// API

export interface Config {
    get<K extends ConfigKey>(key: K): ConfigMap[K];
    set<K extends ConfigKey>(key: K, value: ConfigMap[K]): void;
    clear(key: ConfigKey): void;
}

/**
 * A persistent, strongly typed store for
 * configurable values. Controls behavior
 * throughout the program. Validation is not
 * very strict, garbage in, garbage out.
 */
export const Config: Config = ((w) => {
    const supportsLocalStorage = (() => {
        try {
            const MAGIC = "localStorageTest";
            const s = w["localStorage"] || localStorage;
            if (!s) return false;
            s.setItem(MAGIC, MAGIC);
            s.removeItem(MAGIC);
            return true;
        } catch (e) {
            return false;
        }
    })();

    if (supportsLocalStorage) {
        const storage = w.localStorage;
        const namespaced = ((s: string) => {
            return `__cfg_${s}`;
        });
        return Object.freeze({
            get<K extends ConfigKey>(key: K): ConfigMap[K] {
                const v = storage.getItem(namespaced(key));
                if (v === null) return DEFAULTS[key];
                return CODECS[key].deserialize(v);
            },
            set<K extends ConfigKey>(key: K, value: ConfigMap[K]): void {
                storage.setItem(namespaced(key), CODECS[key].serialize(value));
            },
            clear(key: ConfigKey): void {
                storage.removeItem(namespaced(key));
            }
        });
    } else {
        const map: Record<string, any> = {};
        return Object.freeze({
            get<K extends ConfigKey>(key: K): ConfigMap[K] {
                if (key in map) return map[key];
                return DEFAULTS[key];
            },
            set<K extends ConfigKey>(key: K, value: ConfigMap[K]): void {
                map[key] = value;
            },
            clear(key: ConfigKey): void {
                delete map[key];
            }
        });
    }
})(window);
