// Must be the first import of src/inject.js: imports are evaluated before the importing module's body,
// so the host tag has to be set here, before core/env.js reads it. __TVSUITE_DEFAULT_HOST__ is set by the build.
// eslint-disable-next-line no-undef
globalThis.__TVSUITE_HOST__ = globalThis.__TVSUITE_HOST__ || __TVSUITE_DEFAULT_HOST__;
