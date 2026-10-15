// Luz assada no Blender (Cycles) para as peças FIXAS do prado: pedras, ruínas, troncos, píer.
// Troca as malhas procedurais por MeshBasicMaterial + lightmap (dia e noite misturados por uNight).
// Arquivos (public/assets/prado/bake/): props.glb (celular: props-m.glb) + props-day.png + props-night.png.
// Faltou algum? Devolve null e a cena fica como estava (luz em tempo real).
//
// Lightmap: pixel = sRGB(L/4), L = luz difusa linear do Cycles. O Basic divide por π → intensidade 4π.
import * as THREE from "three";

const KINDS = ["stoneV", "stone", "rock", "bark", "wood"];   // stoneV antes de stone (casa pelo prefixo)
const kindOf = (s = "") => KINDS.find((k) => s.startsWith(k));

// mesma seleção de src/dev/export-prado.js: malha fixa, não instanciada, fora de árvore/barco
function procedural(o) {
  if (!o.isMesh || o.isInstancedMesh || !o.visible) return false;
  for (let p = o; p; p = p.parent) if (p.name === "tree" || p.name === "boat") return false;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  return KINDS.includes(m?.name);
}

// mistura dia/noite no lugar da leitura do lightmap; opcional: relevo do normalMap modulando a luz
function bakedShader(mat, { nightLM, night, bump, sunDir, detail }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNightLM = { value: nightLM }; sh.uniforms.uNight = night;
    let head = "uniform sampler2D uNightLM;\nuniform float uNight;\n", lm = "";
    if (bump) {
      // termo de detalhe barato: normal do mapa (base tangente pelas derivadas) vs. normal da malha, contra o sol
      sh.uniforms.uBump = { value: bump }; sh.uniforms.uSunD = { value: sunDir }; sh.uniforms.uDetail = { value: detail };
      sh.vertexShader = "varying vec3 vBW, vBN;\n" + sh.vertexShader.replace("#include <worldpos_vertex>",
        "#include <worldpos_vertex>\n  vBW = (modelMatrix * vec4(transformed, 1.)).xyz; vBN = mat3(modelMatrix) * normal;");
      head += "uniform sampler2D uBump;\nuniform vec3 uSunD;\nuniform float uDetail;\nvarying vec3 vBW, vBN;\n";
      lm = `
    {
      vec3 N = normalize(vBN), q0 = dFdx(vBW), q1 = dFdy(vBW); vec2 s0 = dFdx(vMapUv), s1 = dFdy(vMapUv);
      vec3 q1p = cross(q1, N), q0p = cross(N, q0), T = q1p * s0.x + q0p * s1.x, B = q1p * s0.y + q0p * s1.y;
      float dt = max(dot(T, T), dot(B, B)), sc = dt == 0. ? 0. : inversesqrt(dt);
      vec3 mn = texture2D(uBump, vMapUv).xyz * 2. - 1.;
      vec3 Nd = normalize(mat3(T * sc, B * sc, N) * mn);
      lightMapTexel.rgb *= clamp(1. + uDetail * (1. - uNight * .6) * (dot(Nd, uSunD) - dot(N, uSunD)), .55, 1.45);
    }`;
    }
    sh.fragmentShader = head + sh.fragmentShader.replace("vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );",
      "vec4 lightMapTexel = mix(texture2D(lightMap, vLightMapUv), texture2D(uNightLM, vLightMapUv), uNight);" + lm);
  };
  mat.customProgramCacheKey = () => "baked" + (bump ? "-bump" : "");
}

// mats: { stone, stoneV, rock, bark, wood } (materiais procedurais: de onde vêm map, cor e vertexColors)
// night: uniform { value } 0..1 (o mesmo U.night do capítulo); sunDir: direção PARA o sol (relevo da pedra)
export async function loadBakedProps(ctx, scene, { mats, night, sunDir, detail = .9, base = "./assets/prado/bake/" }) {
  const L = ctx.loader, urls = ["props.glb", "props-day.png", "props-night.png"].map((f) => base + f);
  try {
    // celular: props-m.glb (pedras mais decimadas, mesmos lightmaps); sem ele, o do computador
    if (ctx.quality?.mobile && (await L.exists(base + "props-m.glb"))) urls[0] = base + "props-m.glb";
    if (!(await Promise.all(urls.map(L.exists))).every(Boolean)) return null;
    const [gltf, day, nightLM] = await Promise.all([L.gltf(urls[0]), L.texture(urls[1]), L.texture(urls[2])]);
    for (const t of [day, nightLM]) { t.flipY = false; t.channel = 1; t.needsUpdate = true; }

    const out = {}, meshes = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const k = kindOf(o.name) || kindOf(o.parent?.name) || kindOf(o.material?.name);
      const src = mats[k], g = o.geometry;
      if (!src || !g.attributes.uv1) { console.warn("[baked] malha ignorada:", o.name); return; }
      const vc = !!src.vertexColors && !!g.attributes.color;
      const mat = out[k] ||= new THREE.MeshBasicMaterial({
        name: k + "-baked", color: src.color, map: k === "rock" ? null : src.map, vertexColors: vc,
        lightMap: day, lightMapIntensity: 4 * Math.PI,
      });
      if (!mat.userData.shader) {
        mat.userData.shader = true;
        const bump = (k === "stone" || k === "stoneV") && detail > 0 && src.normalMap && mat.map ? src.normalMap : null;
        bakedShader(mat, { nightLM, night, bump, sunDir, detail });
      }
      const m = new THREE.Mesh(g, mat);
      m.name = k + "-baked"; m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld); m.matrixWorldNeedsUpdate = true;
      m.castShadow = true; m.receiveShadow = false;   // ainda fazem sombra (grama, água) em tempo real
      meshes.push(m);
    });
    if (!meshes.length) return null;

    // tira as procedurais equivalentes (só dos tipos que vieram no arquivo)
    const old = [];
    scene.traverse((o) => { if (procedural(o) && out[(Array.isArray(o.material) ? o.material[0] : o.material).name]) old.push(o); });
    old.forEach((o) => o.removeFromParent());
    meshes.forEach((m) => scene.add(m));
    console.info("[baked] peças assadas:", Object.keys(out).join(", "), `(${old.length} malhas trocadas por ${meshes.length})`);
    return out;
  } catch (e) {
    console.warn("[baked] falhou, mantendo luz em tempo real:", e);
    return null;
  }
}
