
export type Coordinates = {
    readonly latitude: number,
    readonly longitude: number
};

export namespace Coordinates {

    const FORMAT_REGEX = /^(90|[0-8]\d|\d)°([0-5]\d)'([0-5]\d)(?:\.(\d))?"([NS])\s(180|1[0-7]\d|\d\d)°([0-5]\d)'([0-5]\d)(?:\.(\d))?"([EW])$/;

    export function of(latitude: number, longitude: number): Coordinates {
        return Object.freeze({ latitude, longitude });
    }

    function formatPart(n: number): string {
        const int = Math.floor(n);
        let seconds = (n - int) * 3600;
        const minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;

        const minutesString = String.fromCharCode(
            0x30 + Math.floor(minutes / 10),
            0x30 + (minutes % 10)
        );
        let secondsString = seconds.toFixed(1);
        if (seconds < 10) secondsString = "0" + secondsString;
        return `${int}°${minutesString}'${secondsString}"`;
    }

    export function format(coords: Coordinates): string {
        let { latitude, longitude } = coords;

        let latSuffix = 'N';
        if (latitude < 0) {
            latitude = -latitude;
            latSuffix = 'S';
        }

        let lngSuffix = 'E';
        if (longitude < 0) {
            longitude = -longitude;
            lngSuffix = 'W';
        }

        return `${formatPart(latitude)}${latSuffix} ${formatPart(longitude)}${lngSuffix}`;
    }

    export function parse(str: string): Coordinates {
        const match = FORMAT_REGEX.exec(str);
        if (!match) throw new Error(`Invalid coordinates: ${str}`);

        let latitude: number = parseInt(match[1]!) +
            (parseInt(match[2]!) * 60 + parseInt(match[3]!)) / 3600;

        if (!!match[4]) latitude += parseInt(match[4]!) / 36000;
        if (match[5] === "S") latitude = -latitude;

        let longitude: number = parseInt(match[6]!) +
            (parseInt(match[7]!) * 60 + parseInt(match[8]!)) / 3600;

        if (!!match[9]) longitude += parseInt(match[9]!) / 36000;
        if (match[10] === "W") longitude = -longitude;

        return Object.freeze({ latitude, longitude });
    }

}
