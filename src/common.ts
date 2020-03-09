import sinon from 'sinon'

// https://github.com/microsoft/TypeScript/issues/1897
export type Json = null | boolean | number | string | Json[] | { [prop: string]: Json }

// Usage: let stub: TypedSinonStub<typeof fs.readFile>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TypedSinonStub<A extends (...args: any) => any> = sinon.SinonStub<Parameters<A>, ReturnType<A>>
