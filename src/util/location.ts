
export type Location = {
    /** X in (0, 1] */
    x: number,

    /** Y in (0, 1] */
    y: number,

    /** Zoom level in 0+ (22 is a sensible maximum) */
    z: number
};

export type CompactLocation = string;

export namespace CompactLocation {

    const O_PRIME: bigint       = 2029790617n;
    const O_MOD_INVERSE: bigint = 633691817n;
    const O_RANDOM: number      = 1825599279;
    const O_MAX: number         = 2147483647;
    const O_MAX_BIG: bigint     = BigInt(O_MAX);

    function oEncode(n: number) {
        return Number((BigInt(n) * O_PRIME) & O_MAX_BIG) ^ O_RANDOM;
    }

    function oDecode(n: number) {
        return Number((BigInt(n ^ O_RANDOM) * O_MOD_INVERSE) & O_MAX_BIG);
    }

    function clampTo(n: number, max: number) {
        return Math.min(Math.max(n, 0), max);
    }

    function n2h(n: number, dest: number[], off: number) {
        dest[off] = (n < 10) ? (0x30 + n) : (0x37 + n);
    }

    function h2n(h: string, off: number): number {
        let c = h.charCodeAt(off);
        if (0x30 <= c && c <= 0x39) return c - 0x30;
        if (0x41 <= c && c <= 0x46) return c - 0x37;
        throw new Error(`Invalid character 0x${c.toString(16)} @ offset ${off}`);
    }

    //

    export function encode(l: Location): CompactLocation {
        const { x, y, z } = l;
        const xi = Math.floor(clampTo(x, 1) * 2048000);
        const yi = Math.floor(clampTo(y, 1) * 2048000);
        const zi = Math.round((clampTo(z, 22) / 22) * O_MAX);

        const buf = new ArrayBuffer(12);
        const u8 = new Uint8Array(buf);
        const u32 = new Uint32Array(buf);

        const n1 = (xi & 0x7FF00000) | (yi & 0x000FFF00) | (zi & 0x000000FF);
        const n2 = (yi & 0x7FF00000) | (zi & 0x000FFF00) | (xi & 0x000000FF);
        const n3 = (zi & 0x7FF00000) | (xi & 0x000FFF00) | (yi & 0x000000FF);

        u32[0] = oEncode(n1);
        u32[1] = oEncode(n2);
        u32[2] = oEncode(n3);

        const chars: number[] = new Array(24);
        for (let i=0; i < 12; i++) {
            const b = u8[i]!;
            n2h(b >> 4, chars, i << 1);
            n2h(b & 0xF, chars, (i << 1) | 1);
        }
        return String.fromCharCode.apply(null, chars);
    }

    export function decode(c: CompactLocation): Location {
        if (c.length !== 24)
            throw new Error(`Compact location has invalid length (expected 24, got ${c.length})`);

        const buf = new ArrayBuffer(12);
        const u8 = new Uint8Array(buf);
        const u32 = new Uint32Array(buf);

        for (let i=0; i < 12; i++) {
            u8[i] = (h2n(c, i << 1) << 4) | h2n(c, (i << 1) | 1);
        }

        const n1 = oDecode(u32[0]!);
        const n2 = oDecode(u32[1]!);
        const n3 = oDecode(u32[2]!);

        const xi = (n1 & 0x7FF00000) | (n2 & 0x000000FF) | (n3 & 0x000FFF00);
        const yi = (n1 & 0x000FFF00) | (n2 & 0x7FF00000) | (n3 & 0x000000FF);
        const zi = (n1 & 0x000000FF) | (n2 & 0x000FFF00) | (n3 & 0x7FF00000);

        return {
            x: xi / 2048000,
            y: yi / 2048000,
            z: (zi * 22) / O_MAX
        };
    }

}
