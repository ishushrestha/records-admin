export class StorageError {
  readonly _tag = "StorageError";
  constructor(readonly details: { readonly cause: unknown }) {}
}
