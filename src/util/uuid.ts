
/**
 * Provides a random version 4 UUID.
 * Polyfill for crypto.randomUUID
 */
export const randomUUID = ((w) => {
    // Provides a randomized 16-byte array
    let randomSource = (() => {
        const buf = new ArrayBuffer(16);
        const u8 = new Uint8Array(buf);
        const u32 = new Uint32Array(buf);
        for (let i=0; i < 4; i++) {
            u32[i] = Math.trunc(Math.random() * 0x100000000);
        }
        return u8;
    });

    // Modernize when possible
    if ("crypto" in w) {
        const crypto = w.crypto;

        // Simply use crypto.randomUUID if present
        if ("randomUUID" in crypto) {
            return (() => {
                return crypto.randomUUID();
            });
        }

        // Use Web Crypto's secure RNG if present
        if ("getRandomValues" in crypto) {
            randomSource = (() => {
                const ret = new Uint8Array(16);
                // @ts-ignore
                crypto.getRandomValues(ret);
                return ret;
            });
        }
    }

    // Create the UUID from scratch
    return (() => {
        const u8 = randomSource();
        u8[6] = (u8[6]! & 15) | 64;  // version 4
        u8[8] = (u8[8]! & 63) | 128; // variant 1

        // Buffer to hold the formatted characters
        const chars = new Uint8Array(36);
        let head = 0;

        // Place a nibble into the buffer as hex
        function put(nibble: number) {
            chars[head++] = (nibble < 0xA) ?
                (0x30 + nibble) :
                (0x57 + nibble);
        }

        // Place octets within "u8" into the buffer as hex
        function putRange(a: number, b: number) {
            for (let i=a; i < b; i++) {
                let octet = u8[i]!;
                put(octet >>> 4);
                put(octet & 0xF);
            }
        }

        // Place an ASCII dash (-) into the buffer
        function putDash() {
            chars[head++] = 0x2D;
        }

        putRange(0, 4);       // time_low
        putDash();
        putRange(4, 6);       // time_mid
        putDash();
        putRange(6, 8);       // time_high_and_version
        putDash();
        putRange(8, 10);      // variant_and_sequence
        putDash();
        putRange(10, 16);     // node

        // Concatenate
        return String.fromCharCode.apply(null, chars as unknown as number[]);
    });
})(typeof globalThis === "object" ? globalThis : window);
