/**
 * `createZodDto()` names its class "AugmentedZodDto". For union schemas (which cannot be `extends`-ed) call
 * this so Swagger shows a proper schema name instead of colliding names.
 */
export function namedDto<T extends object>(dto: T, name: string): T {
  Object.defineProperty(dto, "name", { value: name });
  return dto;
}
