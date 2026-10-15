// Carregador único para os capítulos: GLB comprimido (Meshopt) + texturas KTX2 (Basis).
// Tudo que o Blender exporta passa por aqui; cada arquivo é baixado uma vez só.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

export function createLoader(renderer) {
  const ktx2 = new KTX2Loader().setTranscoderPath("./basis/").detectSupport(renderer);
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const tex = new THREE.TextureLoader();
  const cache = new Map();

  const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

  return {
    gltf: (url) => once(url, () => gltf.loadAsync(url)),
    ktx2: (url) => once(url, () => ktx2.loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; return t; })),
    texture: (url, { srgb = true } = {}) => once(url, () => tex.loadAsync(url).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
    })),
    // existe? (capítulos usam um substituto leve enquanto o modelo assado não foi gerado)
    // (o servidor do Vite devolve a página HTML para arquivos inexistentes, por isso checa o tipo)
    exists: (url) => once("head:" + url, () => fetch(url, { method: "HEAD" })
      .then((r) => r.ok && !(r.headers.get("content-type") || "").includes("text/html")).catch(() => false)),
    forget: (url) => cache.delete(url),
  };
}

// Libera tudo que um capítulo colocou na GPU.
export function disposeScene(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
      m.dispose();
    }
  });
}
