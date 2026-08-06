/**
 * Two bench specimens for the galaxy — the body a folder is.
 *
 * They live beside `ring-variants.js` and not inside `specs.js` for the reason `specs.js:42-48`
 * gives: candidate and production must stay visibly separate, or the question "which one is in
 * the sky?" starts depending on reading code instead of on looking.
 *
 * Both IMPORT the real module. Nothing here reimplements geometry, a shader, or the
 * classification rule — the controls MULTIPLY what `galaxyParams` already derived from the
 * seed, so if the derivation breaks the panel breaks with it, which is the point.
 *
 * ⚠️ THE BENCH HAS NO BLOOM and no post chain (`main.js:1-15`). Every verdict reached here is
 * OPTIMISTIC relative to the live scene, where `UnrealBloomPass(0.58, 0.32, 0.72)` veils
 * anything thinner than a few pixels. A pass here is necessary, not sufficient.
 */
import * as THREE from 'three';
import {
  createGalaxy,
  galaxyParams,
  diskPx,
  OMEGA_P,
  SPAN,
  LOD_ARM_PX,
  LOD_TEX_PX,
} from '../space/galaxy.js';
import { GALAXY_CLASSES } from '../space/galaxy-classes.js';

/*
 * FRAMEBUFFER height, not `window.innerHeight`.
 *
 * `galaxy.update` wants the same unit `scene.js:884-886` feeds `graph.update` — `canvas.height`,
 * which already carries the devicePixelRatio. Passing the CSS height at DPR 2 halves every pixel
 * number the module sees: the tier readout, the LOD choice and the shader's analytic band limit
 * all fire at half the size they will in the scene, so a body the bench calls 15 px is a body
 * the scene would call 30. Read from the canvas rather than rebuilt from
 * `innerHeight * devicePixelRatio`, the argument `ring-variants.js:352-357` already makes: the
 * bench is free to cap the DPR, and then the reconstruction would be wrong.
 *
 * The consequence for the operator: APPARENT RADIUS below is in framebuffer pixels, and what the
 * eye sees is that divided by the DPR. Both are printed.
 */
function bufferHeight() {
  return document.querySelector('canvas')?.height ?? window.innerHeight;
}

/** Tier label from the disc radius in pixels. Same shape as `specs.js:294` for the planet. */
function tierOf(px) {
  if (px < LOD_ARM_PX) return 'T0 KNOTS';
  if (px < LOD_TEX_PX) return 'T1 ARMS';
  return 'T2 TEXTURE';
}

/*
 * The flux-weighted recomposition of the bulge and disc colours.
 *
 * This is the readout that makes the identity invariant checkable at a glance instead of
 * eyeballed: `BT*warm + (1-BT)*cool` must come back as `KIND_COLORS[kind]`, unchanged, at every
 * class and every level of detail. Drift here means a folder changes identity as the camera
 * approaches — the one defect that would make this object worse than the gray dot it replaces.
 */
const RECOMPOSED = new THREE.Color();
function integratedHex(params) {
  const bt = params.bulgeFraction;
  RECOMPOSED.setRGB(
    bt * params.warm.r + (1 - bt) * params.cool.r,
    bt * params.warm.g + (1 - bt) * params.cool.g,
    bt * params.warm.b + (1 - bt) * params.cool.b
  );
  return RECOMPOSED.getHexString();
}

// ------------------------------------------------------------------ 1 · ONE BODY, LOD SWEEP

const SINGLE = {
  id: 'galaxia',
  name: 'GALÁXIA',
  /*
   * One galaxy, and the BODY RADIUS slider sweeps the whole detail ladder in one gesture —
   * the same trick the planet specimen uses, and for the same reason: in the scene this object
   * only opens up after the camera locks onto a node, which needs an indexed corpus, a server
   * and the right node.
   *
   * 24 and not the 3.4 the other specimens use: the disc is `SPAN` (2.8) times the anchor
   * radius the sliders talk about, so at 3.4 the bench opened at ~1440 fb px — seven times past
   * the top of the ladder, with every tier already saturated. At 24 it opens near 204, the
   * T1/T2 boundary, and BODY RADIUS sweeps down through the whole ladder from there.
   */
  distance: 24,
  controls: [
    // Starts at 2, the MODAL folder (23 of the 69 real directories), so the bench opens on the
    // most common object rather than on the prettiest one. The range reaches 0 and 54, the two
    // repo hubs, so the whole open-ended-band argument is one drag away.
    { key: 'files', label: 'FILES IN FOLDER', type: 'range', min: 0, max: 60, step: 1, value: 2 },
    /*
     * The axis that picks the class. Range is the observed one on the live corpus (0.06 to 0.93),
     * default at the measured median (0.50).
     *
     * ⚠️ Concentration cannot go below `1/files` — that is the uniform split, the floor by
     * definition — so the bench clamps and the readout prints what was REALISED. Asking for 0.06
     * with 2 files and seeing 0.50 come back is the constraint being visible, not a bug.
     */
    { key: 'conc', label: 'MASS CONCENTRATION', type: 'range', min: 0.05, max: 0.95, step: 0.01, value: 0.5 },
    { key: 'seed', label: 'SEED (path)', type: 'range', min: 0, max: 1, step: 0.001, value: 0.42 },
    { key: 'kind', label: 'KIND', type: 'enum', options: ['dir', 'repo'], value: 'dir' },
    { key: 'radius', label: 'BODY RADIUS', type: 'range', min: 0.05, max: 2, step: 0.01, value: 1 },
    {
      key: 'override',
      label: 'FORCE CLASS',
      type: 'enum',
      options: ['auto', ...GALAXY_CLASSES.map((entry) => entry.label)],
      value: 'auto',
    },
    { key: 'spin', label: 'PATTERN SPEED ×', type: 'range', min: -20, max: 20, step: 0.1, value: 1 },
    { key: 'armAmp', label: 'ARM CONTRAST ×', type: 'range', min: 0, max: 2.5, step: 0.01, value: 1 },
    { key: 'dust', label: 'DUST ×', type: 'range', min: 0, max: 2.5, step: 0.01, value: 1 },
    { key: 'armsOnly', label: 'ARM FIELD ONLY', type: 'bool', value: false },
    /*
     * O modo MUNDO é o que a cena usa na galáxia EM FOCO, e ele precisa de espécime pelo motivo
     * que o anel deixou registrado (`835e749`, `specs.js`): a bancada só sabia desenhar o
     * billboard, e o billboard não muda de pose por mais que se orbite — o caminho onde o defeito
     * mora não era desenhável aqui, então ele não tinha como ser reprovado.
     */
    { key: 'mundo', label: 'GALÁXIA DE MUNDO (foco)', type: 'bool', value: false },
    { key: 'reshuffle', label: 'RESHUFFLE PARTITION', type: 'action' },
  ],
  watch: [
    'no seam at theta = ±pi: run time, sweep SEED, look along the +x axis. A radial scar means a non-integer arm count, a non-periodic noise, or an fwidth on the atan branch cut.',
    'PATTERN SPEED to 20 and press CORRER for ~10s: the arms must NOT wind up. Curvature is frozen; only the phase moves. Tightening over time means someone advected geometry per-radius and reintroduced the winding the edge field died of (catalog.js:235-240).',
    'FILES < 3 gives ZERO arms whatever the class says — and the readout must SAY the ceiling bit ("classe pede N"). A folder with two files has two groups; drawing three asserts a group that is not there. It bites on 18 of the 70 real hubs.',
    'MASS CONCENTRATION 0.05 → 0.95 on auto with FILES fixed at 12: the class steps exactly at 0.375 | 0.500 | 0.669 — the measured quartiles of the corpus — and runs BACKWARDS along the ladder, V3 at the diffuse end and V0 at the concentrated end. More concentrated is an earlier type; that is the whole physical claim of this axis.',
    'the two readouts of CONC must agree except below the floor. Set FILES = 2 and drag CONC to 0.05: it must report `0.05 → 0.50`, because with two children the largest cannot hold less than half. A slider that reports back what you asked for down there is not clamping, and the class it picks is a lie.',
    'FILES 0 → 60 with CONC fixed: the class must NOT change (arms and partition do). Class comes from mass concentration alone; if it moves with the count, file count leaked back into morphology.',
    'the `groups` readout must sum to FILES. An arm holding no file is DIM, never missing — the arm exists, the group is empty.',
    'RESHUFFLE PARTITION with FILES fixed: the `groups` readout must reach a DIFFERENT partition — within a click or two, not necessarily on the first, since a new path can hash to the partition it already had. If several clicks in a row leave `groups` untouched, arm brightness is a function of arm count and the partition is not reaching the shader.',
    'the bright arm must stay bright ALONG ITS WHOLE LENGTH, out to the rim. A bright side fixed to one screen direction that the arms wind away from means the asymmetry is riding on raw theta instead of on the unwound angle.',
    'the bar appears at FILES = 5 and NOT at FILES = 4. Bar presence is the V1|V2 cue and must be binary. (It is also a deliberate lie: the real bar fraction is ~50% and roughly type-independent.)',
    'BODY RADIUS 0.05 → 2.0: between 26 and 90 pxDisk the knots STRETCH into arms. If they crossfade or pop, the two tiers are two objects instead of one function.',
    'BODY RADIUS at its smallest: the core stays a smooth blob — no flicker, no aliasing sparkle. That is the pixel floor on the core radius, and it is what lets this object be the ONLY renderer of a hub.',
    'V1 at small BODY RADIUS: the arms FADE INTO A SMOOTH DISC, not into concentric moire rings. Rings mean the analytic band limit (knot FWHM in px) is missing.',
    'the arms START away from the nucleus and never converge into it as m straight spokes. Inside r_in a log spiral has no winding left, so an ungated arm field degenerates into a radial starburst that reads as lens flare — this bench caught exactly that.',
    'ARM CONTRAST to 0: the disc goes PERFECTLY smooth, no ghost of an arm anywhere. The arms are a modulation of the disc profile, not a second object drawn over it.',
    '⚠️ the `integrated` readout CANNOT check the arm modulation. It recomposes `BT*warm + (1-BT)*cool` on the CPU from the unmodulated params, so it is structurally incapable of moving with ARM CONTRAST — do not read it as a pass. What it does prove, and it is worth proving, is that the CPU colour split round-trips to `base` exactly at every class and both KINDs. The shader-side claim (<sharp> normalised, asymmetry orthogonal to the ridge, so <armMod> = 0) is checked by integrating the fragment offline; on this bench it is only visible as the disc not obviously changing hue.',
    'above 90 pxDisk a dark lane appears on ONE side of each arm and blue knots on the OTHER. Flip PATTERN SPEED negative: they must SWAP sides. If they do not, the lane is anchored to geometry instead of to rotation and the shock is on the wrong face.',
    'DUST to 0: the lane disappears AND what is behind it gets BRIGHTER. Unchanged means the lane is a painted dark line, not extinction.',
    'KIND dir ↔ repo: gray ↔ amber changes, morphology does NOT. The class must never ride on the kind colour.',
    'the `integrated` readout must stay within ~1% of `base` across all four classes, both KINDs and the whole LOD range (dust reddens it a few % at T2, by design).',
    'reload with the same SEED: bit-identical. Every random here is hash01(path, salt); one Math.random anywhere and the same folder gets a different galaxy every session.',
    'com GALÁXIA DE MUNDO desligada, ORBITE com o mouse: a elipse tem de manter EXATAMENTE a mesma forma. É billboard, e fora do foco isso está certo — de longe o corpo é sinal e um disco de perfil apagaria a contagem de braços.',
    '⚠️ ligue GALÁXIA DE MUNDO e ORBITE, mexendo SÓ na câmera: o disco tem de ABRIR até circular e FECHAR até virar uma faixa fina, e o readout `pose` tem de andar junto. Se a imagem não muda, a pose de mundo não está chegando ao atributo; se ela muda de forma mas o peso não, a profundidade óptica voltou a ficar pinada — foi assim que o anel falhou em silêncio.',
    'de perfil (pose cos ~0) a faixa tem de SATURAR e ficar densa, não sumir nem apagar: é tau/cos(i) com o piso de espessura do disco (ASPECT_FOLHA, 0,05). Um disco que desaparece de perfil está afirmando espessura zero.',
    'orbite ATÉ PASSAR PARA O OUTRO LADO do disco (pose cos troca de sinal): a espiral tem de aparecer enrolando para o LADO CONTRÁRIO. Mesma quiralidade dos dois lados significa que o espelho da face não chegou — o objeto estaria mentindo sobre qual lado você está vendo.',
    'com GALÁXIA DE MUNDO ligada, orbite devagar e olhe a BARRA: ela tem de ficar parada no mundo, virando com o disco. Se ela girar dentro do disco enquanto você anda em volta, a fase não está sendo descontada da base do plano e o objeto rodopia por você estar se movendo.',
  ],
  build(ctx) {
    const galaxy = createGalaxy(8);
    const entry = { params: null, position: new THREE.Vector3(), radius: 1 };
    const batch = [entry];
    // RESHUFFLE moves the PATH, not a hidden random: the partition is a function of the path,
    // so changing the path is the only honest way to get a different one.
    let shuffle = 0;

    return {
      object: galaxy.object,
      onAction(key) {
        if (key === 'reshuffle') shuffle += 1;
      },
      update(values, camera, clock) {
        /*
         * The seed enters as a synthetic PATH, never as a raw number. `hash01(node.source)` is
         * the real contract, and testing it through another door stops testing the part that
         * keeps a folder from changing identity when the corpus gains a file.
         */
        const path = `bench/galaxy-${values.seed.toFixed(3)}-${shuffle}`;
        const files = Math.round(values.files);
        const base = galaxyParams(
          { source: path, kind: values.kind },
          // Children WITH mass, because mass is what picks the class now. Fabricating only paths
          // would hand the module a uniform split and the concentration slider would move nothing.
          fabricateChildren(path, files, values.conc),
          values.override === 'auto' ? null : values.override
        );
        const params = {
          ...base,
          armAmp: base.armAmp * values.armAmp,
          bulgeLight: values.armsOnly ? 0 : base.bulgeLight,
          barGain: values.armsOnly ? 0 : base.barGain,
        };

        entry.params = params;
        entry.radius = values.radius;
        const height = bufferHeight();
        galaxy.tune({ dust: values.dust, omega: OMEGA_P * values.spin });
        // `focusedIndex` 0 = este espécime é o corpo "em foco": vira disco de MUNDO e passa a
        // responder à órbita. -1 mantém o billboard, que é o que o céu desenha fora do foco.
        galaxy.update(batch, camera, height, clock.elapsed, values.mundo ? 0 : -1);

        // The SAME function the module used to pick the tier — not a second copy of the
        // projection, which is how two numbers that must agree stop agreeing.
        const px = diskPx(
          values.radius * SPAN,
          camera.position.distanceTo(entry.position),
          height,
          camera.fov
        );

        /*
         * A POSE lida do módulo, não recalculada aqui. Uma segunda cópia da trigonometria seria a
         * primeira coisa a divergir, e justamente quando a leitura fosse útil — o argumento que
         * `d73328f` fez ao tirar `viewFeatures` de dentro de `quasarParams`.
         */
        const pose = galaxy.pose();

        ctx.report({
          files,
          orientação: pose
            ? `MUNDO · cos ${pose.cosView.toFixed(3)} · achata ${Math.abs(pose.cosInc).toFixed(3)} · face ${pose.cosInc < 0 ? 'de trás' : 'de frente'}`
            : `billboard (tela) · cos ${base.cosInc.toFixed(3)} fixo`,
          // Asked vs REALISED. They differ whenever the ask is below the `1/files` floor, and
          // printing only one of the two would hide the clamp behind a slider that lies.
          conc: `${values.conc.toFixed(2)} → ${Number.isFinite(base.concentration) ? base.concentration.toFixed(2) : '—'}`,
          mass: base.mass,
          'class': `${base.class.label} ${base.class.hubble} (${base.class.id})`,
          arms: `${base.arms}${base.arms < base.class.arms ? ` (class asks ${base.class.arms}, capped by files)` : ''}`,
          pitch: base.arms ? `${base.pitchDeg}° · ${base.turns.toFixed(2)} turns` : '—',
          'B/T': base.bulgeFraction.toFixed(2),
          bar: base.barLen ? base.barLen.toFixed(2) : 'none',
          // Per-arm FILE COUNTS, not weights: printed so that "the arms are the groups" is
          // falsifiable rather than decorative. It has to sum to FILES.
          groups: base.arms ? `[${base.counts.join(', ')}] = ${base.counts.reduce((a, b) => a + b, 0)}` : '—',
          spin: base.spin > 0 ? 'prograde' : 'retrograde',
          pxDisk: `${px.toFixed(0)} fb · ${(px / (window.devicePixelRatio || 1)).toFixed(0)} on screen`,
          tier: tierOf(px),
          integrated: `#${base.base.getHexString()} → #${integratedHex(base)}`,
        });
      },
      dispose: () => galaxy.dispose(),
    };
  },
};

// ------------------------------------------------------------------ 2 · THE CONTACT SHEET

/*
 * Representative file counts, one per class, chosen from the real histogram: 2 is the mode, 4
 * the median, 6 sits mid-band, and 12 is a genuine top-band folder (`oracle/cli`).
 */
/**
 * Children with mass, for the bench. The largest holds `concentration` of the total and the rest
 * split what is left evenly.
 *
 * The clamp is the definition, not a safety net: with `n` children the largest one can never hold
 * less than `1/n` of the mass, so asking for 0.06 with 2 files is asking for something that cannot
 * exist. Without the clamp the "smallest" child would come out the largest and the realised
 * concentration would be `1 - ask` — the slider running backwards below the floor.
 */
function fabricateChildren(path, files, concentration) {
  const n = Math.max(0, Math.round(files));
  if (n === 0) return [];
  const TOTAL = 1000;
  const share = Math.max(concentration, 1 / n);
  const top = Math.max(1, Math.round(TOTAL * share));
  const rest = n > 1 ? Math.max(1, (TOTAL - top) / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => ({ source: `${path}/#${i}`, chunks: i === 0 ? top : rest }));
}

const SPECIMEN_FILES =[2, 4, 6, 12];
/** Separation between bodies, in disc radii. 3.0 leaves a clear gap at every class. */
const SHEET_STEP = 3.0;

const SHEET = {
  id: 'galaxia-legibilidade',
  name: 'GALÁXIA · LEGIBILIDADE',
  /*
   * The decisive specimen, and the reason it exists is that a one-galaxy bench CANNOT answer
   * this design's central question — can you tell V1 from V2 at 15 px? — because that question
   * is comparative. Four classes at an IDENTICAL commanded apparent radius, one slider.
   *
   * If the answer is no, this design has failed at its own premise and has to say so.
   */
  distance: 30,
  controls: [
    /*
     * FRAMEBUFFER pixels, so 30 here is the "15 px" the design argues about as the EYE sees it
     * on a DPR-2 display — and it is also, not by coincidence, where the median directory lands
     * in the live sky (`galaxy.js`, `SPAN`). The range reaches 160 so the operator can drive the
     * on-screen size up to 80 as well; both numbers are printed.
     */
    { key: 'px', label: 'APPARENT RADIUS (fb px)', type: 'range', min: 8, max: 160, step: 1, value: 30 },
    { key: 'seed', label: 'SEED (path)', type: 'range', min: 0, max: 1, step: 0.001, value: 0.42 },
    { key: 'spin', label: 'PATTERN SPEED ×', type: 'range', min: -20, max: 20, step: 0.1, value: 1 },
    { key: 'labels', label: 'SHOW LABELS', type: 'bool', value: true },
  ],
  watch: [
    'the four must be distinguishable WITHOUT the labels at the default 30 fb px (= 15 on screen at DPR 2). SHOW LABELS hides the class names from the PANEL — there is no on-canvas text to dismiss, the bench has no text renderer — so turn it off, name the four yourself, then turn it back on. If you need the readout, this design has failed at its own premise.',
    'each pair must differ by a DIFFERENT primitive — V0|V1 by flatness and knot presence, V1|V2 by the bar, V2|V3 by knot count and core brightness. If two pairs lean on the same cue, one class is redundant and the ladder should be three.',
    'count the knots at the default 30 fb px: 0, 3, 4, 6. If 4 and 6 are not reliably countable, the arm-count ladder has to shrink and V3 has to find another cue. ⚠️ MEASURED ON THIS BENCH AND UNRESOLVED: 6 was not countable below ~48 fb px, and V3 reads as a SOFTER, less structured body than V2 rather than a busier one — B/T 0.05 plus six thin arms means the biggest folder in the sky is the mushiest object in it. That inverts the intent, and it is the open design question here.',
    'drag px down and find where each pair stops separating. ⚠️ THE NUMBER IS STILL MISSING and it belongs in this line: a merge point is a perceptual call and no automated readback substitutes for a person at the real display. What HAS been measured, over 8 → 96 fb px, is only the ORDERING — at every size V2|V3 is the closest pair and V0|V1 the most separated, so V2|V3 is where the floor will be found. Screenshot the bench through an MCP client and you get a downscaled image; the call needs the real screen.',
    'the `achieved` readout must equal APPARENT RADIUS for all four. The specimen inverts the projection to place each body; if the achieved values differ from the command, the inversion is lying and every verdict above is void.',
    '⚠️ no bloom here. In the live scene UnrealBloomPass(0.58, 0.32, 0.72) veils anything thinner than a few px, so the final call needs one screenshot of the real sky.',
  ],
  build(ctx) {
    const galaxy = createGalaxy(8);
    const entries = GALAXY_CLASSES.map(() => ({
      params: null,
      position: new THREE.Vector3(),
      radius: 1,
    }));
    /*
     * The row is laid out along the CAMERA's right vector, re-read every frame, not along a
     * fixed world axis. A contact sheet whose row recedes into the screen the moment the
     * operator orbits is not a contact sheet — the four stop being comparable exactly when he
     * moves to look at them. Taken from the quaternion rather than from `matrixWorld` because
     * `main.js` calls `lookAt` and then `update`, and the world matrix is only refreshed at
     * render: reading it here would put the row one frame behind the camera.
     */
    const right = new THREE.Vector3();

    return {
      object: galaxy.object,
      update(values, camera, clock) {
        const height = bufferHeight();
        const tan = Math.tan((camera.fov * Math.PI) / 360);
        const centre = Math.max(camera.position.length(), 0.001);
        /*
         * Invert the projection: the disc radius that subtends `px` at the camera's current
         * distance. The step is derived from it so the sheet keeps its spacing at any zoom.
         */
        const nominalDisc = (values.px * 2 * tan * centre) / height;
        const step = nominalDisc * SHEET_STEP;
        right.set(1, 0, 0).applyQuaternion(camera.quaternion);

        entries.forEach((entry, i) => {
          entry.position.copy(right).multiplyScalar((i - (entries.length - 1) / 2) * step);
          // Re-solved PER BODY against its own distance, which is not the centre distance once
          // they are spread along x. This is what makes "identical apparent size" true rather
          // than approximately true.
          const distance = camera.position.distanceTo(entry.position);
          const disc = (values.px * 2 * tan * distance) / height;
          entry.radius = disc / SPAN;
          entry.params = galaxyParams(
            { source: `bench/sheet-${values.seed.toFixed(3)}-${i}`, kind: 'dir' },
            SPECIMEN_FILES[i],
            GALAXY_CLASSES[i].id
          );
        });

        galaxy.tune({ omega: OMEGA_P * values.spin });
        galaxy.update(entries, camera, height, clock.elapsed);

        const achieved = entries
          .map((entry) =>
            diskPx(
              entry.radius * SPAN,
              camera.position.distanceTo(entry.position),
              height,
              camera.fov
            ).toFixed(1)
          )
          .join(' · ');

        ctx.report(
          values.labels
            ? {
                'left → right': GALAXY_CLASSES.map((c) => `${c.label} ${c.hubble}`).join(' · '),
                arms: GALAXY_CLASSES.map((c) => c.arms).join(' · '),
                bar: GALAXY_CLASSES.map((c) => (c.barLen ? 'yes' : 'no')).join(' · '),
                files: SPECIMEN_FILES.join(' · '),
                commanded: `${values.px.toFixed(0)} fb px · ${(values.px / (window.devicePixelRatio || 1)).toFixed(1)} on screen`,
                achieved: `${achieved} fb px`,
              }
            : {
                labels: 'OFF — name them yourself, then turn labels on',
                commanded: `${values.px.toFixed(0)} fb px · ${(values.px / (window.devicePixelRatio || 1)).toFixed(1)} on screen`,
                achieved: `${achieved} fb px`,
              }
        );
      },
      dispose: () => galaxy.dispose(),
    };
  },
};

export const GALAXY_VARIANTS = [SINGLE, SHEET];
