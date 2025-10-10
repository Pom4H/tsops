/**
 * Type-level utilities for DSL implementation.
 * These utilities provide compile-time guarantees and transformations.
 * 
 * @module dsl/utils
 */

/**
 * Extract string keys from object type.
 */
export type Keys<T> = Extract<keyof T, string>

/**
 * Extract all values from object type.
 */
export type Values<T> = T[keyof T]

/**
 * Check if all values in a type are distinct (no duplicates).
 * Returns true if all unique, never otherwise.
 * 
 * @example
 * type A = AllDistinct<1 | 2 | 3> // true
 * type B = AllDistinct<1 | 2 | 1> // never
 */
export type AllDistinct<T, Seen = never> = [T] extends [never]
  ? true
  : T extends infer X
  ? X extends Seen
    ? never
    : AllDistinct<Exclude<T, X>, Seen | X>
  : never

/**
 * Ensure all values in object are distinct.
 * Returns true if distinct, never otherwise.
 * 
 * @example
 * type Hosts = { a: 'x.com', b: 'y.com' } // EnsureDistinct<Values<Hosts>> = true
 * type Bad = { a: 'x.com', b: 'x.com' }   // EnsureDistinct<Values<Bad>> = never
 */
export type EnsureDistinct<T> = AllDistinct<T> extends true ? true : never

/**
 * Make specific keys optional in object type.
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Make specific keys required in object type.
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

/**
 * Check if type is never.
 */
export type IsNever<T> = [T] extends [never] ? true : false

/**
 * Check if type is any.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Error type with custom message.
 * Used to provide better error messages in type constraints.
 */
export type TypeError<Message extends string> = {
  readonly __error__: Message
} & never

/**
 * Conditional error - returns T if condition is true, error otherwise.
 */
export type Assert<Condition extends boolean, T, ErrorMsg extends string> = 
  Condition extends true ? T : TypeError<ErrorMsg>

/**
 * Deep readonly - makes all nested properties readonly.
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

/**
 * Extract literal string values from union.
 */
export type LiteralString<T> = T extends string
  ? string extends T
    ? never
    : T
  : never

/**
 * Get the return type of function or the type itself if not a function.
 */
export type Resolved<T> = T extends (...args: any[]) => infer R ? R : T

/**
 * Function or value type.
 */
export type MaybeFn<Args, Return> = Return | ((args: Args) => Return)

/**
 * Resolve MaybeFn to its return type.
 */
export type ResolveMaybeFn<T, Args> = T extends (args: Args) => infer R ? R : T
