import { CountryCode } from 'libphonenumber-js';
export declare function syncCountries(): Promise<({
    name: string;
    code: CountryCode;
    iso3: string;
    dialCode: string;
} | null)[] | null>;
