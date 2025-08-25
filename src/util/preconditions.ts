
export namespace Preconditions {

    function referent(descriptor?: string): string {
        return !!descriptor ?
            `Value \"${descriptor}\"` :
            "Value";
    }

    export function int(value: number, descriptor?: string): number {
        if (Number.isSafeInteger(value))
            return value;

        if (Number.isNaN(value))
            throw new Error(`${referent(descriptor)} is not an integer: got NaN`);

        if (value === Number.NEGATIVE_INFINITY || value === Number.POSITIVE_INFINITY)
            throw new Error(`${referent(descriptor)} is not an integer: got infinity`);

        if (value < Number.MIN_SAFE_INTEGER || value > Number.MAX_SAFE_INTEGER)
            throw new Error(`${referent(descriptor)} is not an integer: got ${value}`);

        return Math.trunc(value);
    }

    export function intRange(value: number, min: number, max: number, descriptor?: string): void {
        value = int(value, descriptor);
        min = int(min, "min");
        max = int(max, "max");

        if (min <= value && value < max) return;
        throw new Error(`${referent(descriptor)} is out of range: expected [${min}, ${max}), got ${value}`);
    }

}
