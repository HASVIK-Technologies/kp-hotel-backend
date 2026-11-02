/** Remove internal storage key and index attributes before returning domain records. */
export function stripKeys<T>(item: Record<string, unknown>): T {
  const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...rest } = item;
  return rest as T;
}
