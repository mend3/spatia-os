/**
 * A SUPERFÍCIE DO `three` que este projeto usa — 55 nomes, e nenhum a mais.
 *
 * O bundle vendorizado (`vendor/three.module.js`, resolvido pelo importmap do `index.html`) não
 * traz declarações. As três saídas possíveis, e por que esta:
 *
 * | saída | o que acontece |
 * |---|---|
 * | `paths` para o bundle | o TS tenta tipar o vendorizado: **1.031** diagnósticos, ~700 deles `new THREE.X()` acusado de não-construível |
 * | `declare module 'three';` (curto) | valores viram `any`, mas `THREE.Vector3` em posição de TIPO no JSDoc quebra — **26** erros |
 * | esta | valor e tipo declarados por nome; membro novo pede uma linha |
 *
 * ⭑ **É a REGRA DO CATÁLOGO aplicada ao vendor: nomeia-se o que se ACEITA.** Usar um membro novo
 * do `three` passa a exigir declará-lo aqui — barato, e transforma "o que esta base usa da
 * biblioteca" numa lista legível em vez de uma pergunta que só o `grep` responde.
 *
 * ⚠️ **`any` é ausência DECLARADA, não tipagem.** Ninguém aqui promete a forma de um `Vector3`;
 * promete-se que o nome existe. Inventar as formas à mão seria uma segunda fonte sobre a
 * biblioteca, livre para divergir do bundle na primeira atualização.
 */
declare module 'three' {
  export const ACESFilmicToneMapping: any;
  export type ACESFilmicToneMapping = any;
  export const AdditiveBlending: any;
  export type AdditiveBlending = any;
  export const BackSide: any;
  export type BackSide = any;
  export const BoxGeometry: any;
  export type BoxGeometry = any;
  export const BufferAttribute: any;
  export type BufferAttribute = any;
  export const BufferGeometry: any;
  export type BufferGeometry = any;
  export const Camera: any;
  export type Camera = any;
  export const ClampToEdgeWrapping: any;
  export type ClampToEdgeWrapping = any;
  export const Clock: any;
  export type Clock = any;
  export const Color: any;
  export type Color = any;
  export const ConeGeometry: any;
  export type ConeGeometry = any;
  export const CustomBlending: any;
  export type CustomBlending = any;
  export const CylinderGeometry: any;
  export type CylinderGeometry = any;
  export const DataTexture: any;
  export type DataTexture = any;
  export const DepthTexture: any;
  export type DepthTexture = any;
  export const DoubleSide: any;
  export type DoubleSide = any;
  export const GridHelper: any;
  export type GridHelper = any;
  export const Group: any;
  export type Group = any;
  export const IcosahedronGeometry: any;
  export type IcosahedronGeometry = any;
  export const InstancedBufferAttribute: any;
  export type InstancedBufferAttribute = any;
  export const InstancedBufferGeometry: any;
  export type InstancedBufferGeometry = any;
  export const InstancedMesh: any;
  export type InstancedMesh = any;
  export const Line: any;
  export type Line = any;
  export const LineBasicMaterial: any;
  export type LineBasicMaterial = any;
  export const LineLoop: any;
  export type LineLoop = any;
  export const LineSegments: any;
  export type LineSegments = any;
  export const LinearFilter: any;
  export type LinearFilter = any;
  export const LinearMipmapLinearFilter: any;
  export type LinearMipmapLinearFilter = any;
  export const MathUtils: any;
  export type MathUtils = any;
  export const Matrix4: any;
  export type Matrix4 = any;
  export const Mesh: any;
  export type Mesh = any;
  export const MeshBasicMaterial: any;
  export type MeshBasicMaterial = any;
  export const MirroredRepeatWrapping: any;
  export type MirroredRepeatWrapping = any;
  export const Object3D: any;
  export type Object3D = any;
  export const OctahedronGeometry: any;
  export type OctahedronGeometry = any;
  export const OneMinusSrcColorFactor: any;
  export type OneMinusSrcColorFactor = any;
  export const PerspectiveCamera: any;
  export type PerspectiveCamera = any;
  export const PlaneGeometry: any;
  export type PlaneGeometry = any;
  export const Points: any;
  export type Points = any;
  export const PointsMaterial: any;
  export type PointsMaterial = any;
  export const Quaternion: any;
  export type Quaternion = any;
  export const RGBAFormat: any;
  export type RGBAFormat = any;
  export const Raycaster: any;
  export type Raycaster = any;
  export const RepeatWrapping: any;
  export type RepeatWrapping = any;
  export const RingGeometry: any;
  export type RingGeometry = any;
  export const SRGBColorSpace: any;
  export type SRGBColorSpace = any;
  export const Scene: any;
  export type Scene = any;
  export const ShaderMaterial: any;
  export type ShaderMaterial = any;
  export const SphereGeometry: any;
  export type SphereGeometry = any;
  export const Texture: any;
  export type Texture = any;
  export const TextureLoader: any;
  export type TextureLoader = any;
  export const Vector2: any;
  export type Vector2 = any;
  export const Vector3: any;
  export type Vector3 = any;
  export const WebGLRenderer: any;
  export type WebGLRenderer = any;
  export const ZeroFactor: any;
  export type ZeroFactor = any;
}

/** Os add-ons de `vendor/jsm/` chegam pelo mesmo importmap, e valem a mesma ausência declarada. */
declare module 'three/*';
