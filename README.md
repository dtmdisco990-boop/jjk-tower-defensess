# Vendored three.js r170 (MIT, see LICENSE)

- `three.module.min.js` — unmodified build from the `three@0.170.0` npm package.
- `examples/jsm/...` — GLTFLoader, SkeletonUtils, BufferGeometryUtils and GLTFExporter from the same package. The only change is
  that their bare `import ... from 'three'` lines point at `../../../three.module.min.js`, so the game needs no import map or bundler.
