// The Worker uses only these native APIs; keep browser code free of Node typings.
declare module 'node:crypto' {
  export function scrypt(password: string, salt: Uint8Array, keyLength: number,
    options: { N: number; r: number; p: number; maxmem: number },
    callback: (error: Error | null, key: Uint8Array) => void): void
  export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean
}
