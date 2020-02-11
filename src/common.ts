// https://github.com/microsoft/TypeScript/issues/1897
export type Json = null | boolean | number | string | Json[] | { [prop: string]: Json }
