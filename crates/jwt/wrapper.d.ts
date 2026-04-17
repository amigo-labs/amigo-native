export type Algorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'ES256'
  | 'ES384'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'EdDSA'

export interface SignOptions {
  algorithm?: Algorithm
  expiresIn?: number
  notBefore?: number
  audience?: string
  issuer?: string
  subject?: string
  jwtid?: string
  header?: Record<string, unknown>
}

export interface VerifyOptions {
  algorithms?: Algorithm[]
  audience?: string
  issuer?: string
  subject?: string
  clockTolerance?: number
  ignoreExpiration?: boolean
  ignoreNotBefore?: boolean
}

export type Secret = string | Buffer | Uint8Array
export type SignCallback = (err: Error | null, token?: string) => void
export type VerifyCallback = (err: Error | null, payload?: unknown) => void

export declare function sign(
  payload: object,
  secret: Secret,
  options?: SignOptions,
): Promise<string>
export declare function sign(
  payload: object,
  secret: Secret,
  options: SignOptions | undefined,
  callback: SignCallback,
): void

export declare function signSync(payload: object, secret: Secret, options?: SignOptions): string

export declare function verify(
  token: string,
  secret: Secret,
  options?: VerifyOptions,
): Promise<unknown>
export declare function verify(
  token: string,
  secret: Secret,
  options: VerifyOptions | undefined,
  callback: VerifyCallback,
): void

export declare function verifySync(token: string, secret: Secret, options?: VerifyOptions): unknown

export declare function decode(
  token: string,
  options?: { complete?: boolean },
): unknown
