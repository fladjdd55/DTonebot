export interface Country {
    name: string;
    code: string;
    iso3: string;
    dialCode: string;
}
export declare const getAllCountries: (countries: Country[]) => Country[];
export declare const filterCountries: (countries: Country[], query: string) => Country[];
export declare const getCountryByCode: (countries: Country[], code: string) => Country | undefined;
export declare const isCountrySupported: (countries: Country[], code: string) => boolean;
