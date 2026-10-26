// The browser gets Rapier from the import map in index.html. Node resolves the
// same bare import from tests/node_modules instead.
const RAPIER = "@dimforge/rapier3d-compat";

export async function resolve(specifier, context, next) {
  if (specifier === RAPIER) return next(specifier, { ...context, parentURL: import.meta.url });
  return next(specifier, context);
}
