/**
 * The galaxy — the body a HUB node (a folder, `node.type !== 'file'`) is, replacing the gray
 * sprite that stands for one today.
 *
 * A folder is not a star. It is an aggregate, and the reading the catalog already sanctions is
 * the one the user proposed: the folder is a galaxy and its files are the population. Each
 * spiral arm is a GROUP of that folder's files, and the arm count comes from how many files
 * there are. The class ladder and the file-count cuts live in `galaxy-classes.js`.
 *
 * ## The number that decided the architecture
 *
 * `graph.js` sizes a hub sprite as `point = uSize * aSize * pulse * shrink * POINT_SCALE/dist`
 * with `uSize = 4.6` (`graph.js:274`) and `POINT_SCALE = 300` (`graph.js:79`), and hubs have
 * `shrink = 1` because `recencies[i] = 0` for them (`graph.js:398`). The visible disc is
 * `VISIBLE_CORE = 0.6` of the sprite (`rings.js:112`), so the anchor radius is
 * `0.3 * point = 414 * aSize / dist`. Directory `aSize` runs 1.98 to 3.97 — median 2.75,
 * recomputed from `GET /api/graph` through `graph.js:400-402` over the 69 directories, not
 * copied — and a whole-sky pose sits 100 to 200 away. **Every hub is therefore 4 to 16 px of
 * anchor radius in the default pose, and there are 71 of them on screen at once.** Pixels here
 * and everywhere below are FRAMEBUFFER pixels, the unit `scene.js:884-886` works in.
 *
 * That is ARITHMETIC on the formulas above, not a GPU measurement, and it rules out both a
 * per-node `Mesh` pool (71 draw calls with 71 `quaternion.copy(camera.quaternion)`) and any cap
 * on how many galaxies are drawn — a cap of six would leave 65 folders as gray dots, which is
 * not "replace the gray gaseous body". So: ONE instanced draw covering all of them, legible
 * from 2 px to 300 px.
 *
 * ## The arms are a PATTERN. This is the trap, not a detail.
 *
 * `catalog.js:235-240` is binding, and it is the reason the permanent `LineSegments` web was
 * removed (`links.js:4-13`): a file at r 26-62 and its hub at r 19-33 have different omega
 * under `speed = (r/r0)^-1.5`, so any material structure joining them shears at 60 Hz. A spiral
 * arm cannot be material (Lin-Shu); it has to be a pattern — same phase, same colour.
 *
 * The implementation rule, in one sentence: **the arm field is a function of (r, theta)
 * evaluated in the pattern's rotating frame, and the pattern speed appears exactly once, as one
 * scalar uniform.** There is no `omega(r)` in this file, no `pow(r, -1.5)`, and no per-file
 * advection. Search for `uOmegaP` — one definition, one use.
 *
 * ## What is deliberately NOT here
 *
 * - **E0-E7 as a family.** Eight elliptical sub-classes over 23 folders is eight distinctions
 *   nobody can make at 15 px, and with a screen-space ellipse the projected ellipticity is
 *   degenerate with inclination — asserting "E4" would assert an intrinsic shape this render
 *   cannot tell from a tilt.
 * - **Edge-on views and the dust-lane silhouette** (NGC 891, the Sombrero). The most
 *   recognisable galaxy image there is, given up on purpose: the ellipse is the number one
 *   readability cue, and a world-oriented disc goes edge-on for half the camera orbit — the
 *   argument `rings.js:28-31` already made. A galaxy that goes edge-on is a galaxy whose arm
 *   count, i.e. the group count, vanishes exactly when the operator rotates the scene.
 * - **de Vaucouleurs r^(1/4).** One `pow(x, 0.25)` per fragment for a profile difference that
 *   is invisible below 60 px. The projected Plummer used instead is EXACT for its own model;
 *   being honest about which model you drew beats being approximate about a more famous one.
 * - **Pitch varying with radius.** Savchenko & Reshetnikov 2013 find ~2/3 of spirals vary pitch
 *   by more than 20%, usually decreasing outward. A single-b log spiral is a stated
 *   simplification whose whole payoff is that `theta_arm(r)` is one `log`. It is also the
 *   cheapest realism upgrade available, and the first thing to add if the bench says the arms
 *   look synthetic.
 * - **A `Points` star cloud per galaxy.** 71 x 2000 points is a second cloud 55x the size of
 *   `stars.js`, inheriting the driver's measured `gl_PointSize` ceiling of 511
 *   (`graph.js:80-89`), to draw at 32 px the same blob the analytic disc already draws.
 * - **`git_root` satellite galaxies.** `catalog.js:232-233` declares them, and the live payload
 *   carries no `git_root` field on any node (checked against `GET /api/graph`, 2026-08-05).
 *   Designing against a schema that does not exist is not design.
 * - **Anything driven by date, any supernova envelope, any crust.** All three are in
 *   `catalog.js`'s `forbids` for `galaxia`. Nothing in this file reads `recency`.
 *
 * ## The honest sentence about the statistics
 *
 * Hart et al. 2016 (Galaxy Zoo 2, bias-corrected) give 2-arm 64%, 3-arm 18%, 4-arm 6%, 5+ 7%,
 * and the bar is roughly a 50% coin that is close to independent of Hubble type — which is
 * precisely why the tuning fork has two parallel branches. **This sky is statistically wrong
 * about both, on purpose:** arm count encodes file count and the bar encodes class, because in
 * an observatory where appearance IS data, a coin flip on the most salient feature in the
 * object would make two folders with identical contents look categorically different for no
 * informational reason. That is decoration wearing the costume of realism. The trade is stated
 * here rather than hidden.
 *
 * ## Owed before this is wired into the scene
 *
 * `catalog.js`'s `galaxia` entry sanctions only `features: { aggregate: ... }`, which governs
 * SIZE. File count driving MORPHOLOGY is a new axis and needs a `features.groups` line saying
 * so. Smuggling it in without amending the catalog is exactly the drift the catalog exists to
 * stop. **This module is bench-only until that amendment lands.**
 *
 * ## Cost — MEASURED for ONE body, and the whole-sky case is still open
 *
 * Method, so the numbers can be argued with: `EXT_disjoint_timer_query_webgl2` bracketing
 * EXACTLY this module's `drawElementsInstanced` on the bench (one instance, `sandbox.html`,
 * 3024x1484 framebuffer at DPR 2, no post chain), 350 frames per size. **Minima are quoted,
 * because the medians came out non-monotonic with area — the queries are heavily contended and
 * the median is measuring the contention, not the shader.** The reference is the project's own
 * 0.45 ms whole-scene frame (`planet.js:5-7`, same extension), post at 87-90% of it.
 *
 * | disc radius | GPU ms, min of 350 |
 * |---|---|
 * | 10 to 75 px | 0.013 to 0.019 — INDISTINGUISHABLE from the empty-draw floor |
 * | 204 px      | 0.071 to 0.098 (two runs) |
 * | 408 px      | 0.185 to 0.266 (two runs) |
 *
 * Two readings, and the second is the one that changed the plan:
 *
 * 1. **At sky sizes one galaxy is free.** Across the entire 10-to-75 px range — which contains
 *    the 32 px steady state and both LOD transitions — a body costs less than this instrument
 *    can resolve. There is no argument here for a draw cap or for a cheaper T0.
 * 2. **The FOCUSED body is where the cost is.** ~0.08 ms at 204 px is ~18% ON TOP of the whole
 *    current frame, and 408 px roughly triples that. The earlier draft of this file guessed
 *    ~0.055 ms for the 200 px case, so the guess was low but the right order — and it had the
 *    conclusion backwards, treating the sky as the risk and the focused body as the cheap case.
 *    Lever (2) below is therefore the FIRST one to pull, not the second.
 *
 * ⚠️ **The whole-sky total is NOT measured and cannot be measured on this bench**, which draws
 * one body. 71 bodies each below the noise floor still sum, and they sum in one draw call, so
 * the per-draw overhead is paid once and the fragment work is what accumulates: at 32 px their
 * combined quad area equals about one 270 px body, which sits between the two measured rows —
 * but on a much cheaper shader path (T0, `detail = 0.024`, no fbm), so that comparison is an
 * upper bound and probably a loose one. `scene.sampleRenderCost()` is the instrument that
 * settles it; run it before and after wiring and replace this paragraph with the two numbers.
 *
 * Bloom does not get more expensive — its cost is resolution-fixed, so adding bright pixels
 * changes its input, not its work. It does change appearance: the core will exceed the 0.72
 * threshold and bloom. That claim is visual, not measured, and the bench cannot check it
 * because the bench has no post chain at all.
 *
 * Levers, in the order the measurement argues for: (1) cap T2 to the single focused body;
 * (2) drop the third fbm octave, which is most of what T2 buys; (3) `SPAN` 2.8 -> 2.2, which is
 * about ink rather than cost; (4) a cap on how many galaxies draw at all — for which there is
 * now no evidence at all.
 */
import * as THREE from 'three';
import { hash01, KIND_COLORS } from './graph.js';
import { GLSL_PSNOISE } from './ring-noise.js';
import { armsFor, classForConcentration, GALAXY_CLASSES, MIN_ARMS } from './galaxy-classes.js';

/*
 * How many anchor radii the disc spans. `R_disk = planetAnchor().radius * SPAN`, and
 * `planetAnchor().radius` traces back to `sizes[i] = 1.5 + log2(1+chunks)*0.3`
 * (`graph.js:400-402`) — the one aggregate the catalog sanctions. Morphology never leaks into
 * apparent size: the disc scale height, the bulge scale and the quad span are identical across
 * all four classes.
 *
 * 2.8 is DERIVED, not picked. At the reference pose (dist 100) the median directory anchors at
 * 11.4 px, so the disc is 32 px in radius. The ink multiplier is `SPAN^2 = 7.84` exactly — the
 * disc replaces the sprite's visible core one for one, so nothing else enters the ratio — and
 * 71 such discs cover roughly 49% of the hub shell's screen footprint against roughly 6% for
 * the sprites (arithmetic: 71 * pi * 32^2 against the projected area of the r <= 33 shell at
 * H = 1000). That 7.8x increase in ink is the single biggest visual risk in this module — it is
 * also exactly the point, folders becoming the structure of the sky, and flux is preserved so
 * each pixel is correspondingly dimmer. `SPAN` is the first lever to pull if the sky reads as
 * a smear, and at ~49% coverage it is likelier to be needed than the first draft assumed.
 */
export const SPAN = 2.8;

/*
 * The detail ladder, in pixels of DISC radius.
 *
 * Reused verbatim from `rings.js:148-149` (26/90) and `planet.js:80-81` (90/200) because they
 * answer the same question — is there structure inside this disc worth resolving? — and a
 * fourth uncorrelated pixel ladder in one scene is a maintenance trap. The bands are wide for
 * the reason `rings.js:142-149` gives: a narrow transition becomes a step, and a step is what
 * makes level of detail look like a bug instead of like detail.
 *
 * `pxDisk = anchorPx * 2.8 = 1159 * aSize / dist`, so the median directory sits at 32 px at
 * dist 100 — just PAST `LOD_ARM_PX`, at `detail = 0.024`. The steady state is therefore the
 * very bottom of T1 rather than T0: visually still knots (the `mix` has barely started), but
 * the operator is already on the ramp, and any tightening of the ladder has to be argued
 * against 32, not against the 27 an earlier draft got from a mis-taken median.
 *
 * There is no OFF tier and no handoff back to the sprite: the pixel floor on the core (see
 * `RE` below) keeps the same object valid at 2 px, where the quad is 5.4 px on a side and all
 * 71 of them cost ~2.1 k fragments in total. `detail` and `detail2` are branch-free `mix`
 * factors — one program, no dynamic branching on the hot path.
 */
export const LOD_ARM_PX = 26;
export const LOD_TEX_PX = 90;
export const LOD_FULL_PX = 200;

/*
 * Half-extent of the billboard quad, in disc radii, and the discard radius — the SAME number on
 * purpose. The drawn region is the ellipse `length(rot(p, -roll) / (1, cosInc)) <= RMAX`, whose
 * bounding box is exactly RMAX in every direction at any roll and any inclination. Letting the
 * two drift is how a disc gets clipped into a straight-edged half, which `rings.js:82-98`
 * already paid for once.
 */
const QUAD_SPAN = 1.35;

/*
 * Bulge scale, in disc radii, for the projected Plummer profile.
 *
 * Courteau, de Jong & Broeils 1996 give `r_e/r_d ~ 0.12`; with the disc truncated near 3.5
 * scale lengths that is `r_e/R ~ 0.034`, about one pixel at R = 30. **0.055 is a deliberate
 * exaggeration for legibility, by a factor of ~1.6x**, on the principle `planet.js:322-329`
 * already states for relief: the ruler here is legibility, and what is preserved is the
 * ordering, not the magnitude.
 */
const RE = 0.055;

/*
 * Disc: `exp(-r/h)` with `h = 1/3.5`, softly truncated because a hard rim reads as geometry
 * (`rings.js:20-26`).
 *
 * DISC_AREA is the integral of the profile the shader actually draws — including the
 * `smoothstep` truncation — over the plane, computed numerically by me at 2e6 samples
 * (0.458737, i.e. 0.894 of the untruncated `2*pi*h^2 = 0.512913`). Using the untruncated value
 * would under-normalise the disc by ~11% and make B/T mean something other than what Graham &
 * Worley measured. That is arithmetic, not a GPU measurement.
 */
const DISK_RATE = 3.5;
const DISK_AREA = 0.458737;

/*
 * Bar: flat-topped in x (`exp(-(x/L)^4)`) with a gaussian waist in y. The fourth power is what
 * gives the flat top and sharp ends early-type bars actually have; an elliptical falloff makes
 * the bar read as a stretched bulge.
 *
 * BAR_AREA is closed form: `int exp(-(x/L)^4) dx * int exp(-(y/wL)^2) dy = 2*Gamma(5/4)*L *
 * w*L*sqrt(pi) = 0.899672 L^2` at w = 0.28. Arithmetic.
 *
 * The bar's light is charged to the BULGE budget, not the disc's, so B/T keeps meaning
 * "spheroid fraction". BAR_FRAC — the share of the spheroid light that sits in the bar — is a
 * PICK.
 */
const BAR_AXIS = 0.28;
const BAR_AREA = 0.899672;
const BAR_FRAC = 0.35;

/*
 * Arm/interarm contrast: 1.42 / 0.58 = 2.45x, inside the measured 1.5-6x grand-design range.
 */
const ARM_AMP = 0.42;

/*
 * Pattern speed, rad/s — shared by every galaxy, because the pattern speed of a density wave
 * is a property of the wave and not of the folder. The per-galaxy SIGN is hashed: a sky where
 * every galaxy turns the same way reads as a stamp, which is the argument `planet.js:354-356`
 * makes for retrograde spin.
 *
 * 0.06 rad/s is ~105 s per turn. That is why the bench ships a pattern-speed multiplier that
 * reaches +-20 — otherwise the winding check would need two minutes of holding CORRER.
 */
export const OMEGA_P = 0.06;

/*
 * Salts. Free ones, checked against every salt already in use across `src/space/`: 2/3/4
 * (`graph.js:500-503`), 7 (`graph.js:410`), 11/23/41 (`planet.js:316-318`), 17
 * (`photosphere.js:178`). Reusing one would give the same folder two features derived from the
 * same number, which is the failure `graph.js:224-230` describes: both look right in isolation.
 */
const SALT_ARM = 53;
const SALT_INC = 59;
const SALT_ROLL = 67;
const SALT_PHASE = 71;
const SALT_SPIN = 83;

/*
 * The warm/cool axis, chosen LUMINANCE-NEUTRAL under Rec.709 so that the bulge/disc split
 * changes hue without changing brightness. Solving `0.2126a + 0.7152b + 0.0722c = 0` with
 * `a = +0.30, c = -0.30` gives `b = -0.0589`; the residual is -5.3e-6, i.e. zero to the precision the constant is
 * written at.
 */
const W_AXIS = Object.freeze([0.300, -0.0589, -0.300]);

/*
 * Star-formation knots, tier 2 only. `K_SF` is how far the knots move along the same warm/cool
 * axis; the weight that carries them has ZERO angular mean by construction, so the integrated
 * colour of the disc does not move when they appear.
 */
const K_SF = 0.55;
const SF_AMOUNT = 0.42;

/*
 * Exact angular means of the integer powers of the arm ridge: `<(0.5+0.5 cos u)^p> =
 * C(2p,p)/4^p`. Arithmetic, and they are what make `<sharp> = 1` hold at EVERY value of
 * `detail` rather than only at the endpoints — which is what makes the colour invariant below
 * provable instead of eyeballed.
 */
const MEAN_P3 = 0.312500;
const MEAN_P9 = 0.185471;
const MEAN_P10 = 0.176197;

/** Azimuthal cells of the tier-2 noise. Integer, and it stays integer in every octave. */
const CELLS = 12;

const TAU = Math.PI * 2;

/*
 * Attribute layout. 22 static floats and 7 per-frame floats per instance (`aCenter` 3 +
 * `aView` 4): 6.2 kB static for 71 hubs, and 497 floats (2.0 kB) uploaded per frame. `graph.js:772-774` warns that a 468-float
 * per-frame upload is real; this is smaller, and unlike `aHalo` it genuinely changes every
 * frame, so there is no conditional-write guard on the view attributes.
 *
 *   aCenter  vec3   per frame  hub position, in the parent group's LOCAL units
 *   aView    vec4   per frame  disc radius (world), pxDisk, detail, detail2
 *   aShape   vec4   static     arms, 1/tan(pitch), r_in, barLen
 *   aPose    vec4   static     cos(inclination), disc roll, pattern phase, spin sign
 *   aGain    vec4   static     bulge light, bar gain, disc gain, arm amplitude
 *   aAsym    vec4   static     the two angular harmonics of the file partition
 *   aWarm    vec3   static     bulge and bar colour
 *   aCool    vec3   static     disc colour
 */
const STATIC_LAYOUT = Object.freeze([
  ['aShape', 4],
  ['aPose', 4],
  ['aGain', 4],
  ['aAsym', 4],
  ['aWarm', 3],
  ['aCool', 3],
]);

const VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec4 aView;
  attribute vec4 aShape;
  attribute vec4 aPose;
  attribute vec4 aGain;
  attribute vec4 aAsym;
  attribute vec3 aWarm;
  attribute vec3 aCool;

  varying vec2 vP;
  varying vec4 vShape;
  varying vec4 vPose;
  varying vec4 vGain;
  varying vec4 vLod;
  varying vec4 vAsym;
  varying vec3 vWarm;
  varying vec3 vCool;

  void main(){
    vShape = aShape;
    vPose = aPose;
    vAsym = aAsym;
    vWarm = aWarm;
    vCool = aCool;
    vP = position.xy * ${QUAD_SPAN.toFixed(3)};

    // PIXEL FLOOR ON THE CORE. Below about one pixel the Plummer cusp aliases and the node
    // sparkles frame to frame. Only the SIZE is floored; the LIGHT is held constant, which is
    // why the normalisation below divides by the floored radius and not by RE — normalising by
    // RE would let a distant hub grow brighter as its core spread out.
    //
    // This is also what removes the sprite handoff entirely: the same object is valid from 2 px
    // to 300 px, so there is no crossfade to hide and no LOD floor to tune.
    float reEff = max(${RE.toFixed(4)}, 1.1 / max(aView.y, 1.0));
    float re2 = reEff * reEff;
    // Projected Plummer, integrated EXACTLY over the region that is drawn:
    //   int_0^R 2*pi*r / (1 + r^2/a^2)^2 dr = pi*a^2 * R^2/(R^2 + a^2)
    float bulgeNorm = 3.14159265 * re2 * (${(QUAD_SPAN * QUAD_SPAN).toFixed(5)}
                    / (${(QUAD_SPAN * QUAD_SPAN).toFixed(5)} + re2));
    vGain = vec4(aGain.x / bulgeNorm, aGain.y, aGain.z, aGain.w);
    vLod = vec4(aView.y, aView.z, aView.w, reEff);

    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    // A hub BEHIND the camera projects with w <= 0 and can smear its quad across the whole
    // screen. Pushing the vertex outside the clip volume is three instructions and is safer
    // than trusting per-vertex near-plane clipping on a quad whose corners straddle it.
    if (mv.z > -0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    // Offsetting AFTER modelViewMatrix is what makes this a billboard without a per-object
    // quaternion copy — and a per-object quaternion is simply impossible in one instanced draw.
    // The price is that this offset BYPASSES the model matrix, so aView.x has to be a world
    // length already. It is: the group sits at the scene root, and update() is fed the world
    // radius planetAnchor returns. Parent this group under a scaled group and the disc detaches
    // from its own centre, which is why the contract on update() pins both ends.
    mv.xy += position.xy * aView.x * ${QUAD_SPAN.toFixed(3)};
    gl_Position = projectionMatrix * mv;
  }
`;

/*
 * ## The disc plane is a 2D ellipse in SCREEN space, not a tilted plane in world space
 *
 * This is `rings.js`'s `uCosTilt` idiom (`rings.js:212, 591`) one dimension up, and it inherits
 * its rationale verbatim (`rings.js:28-31`): a world-oriented disc goes edge-on for half of the
 * camera's orbit, disappearing exactly when the operator rotates the scene. For a ring that
 * costs a silhouette; for a galaxy it costs the ARM COUNT, which is the group count, which is
 * the only information this object carries.
 *
 * ## Knots and arms are ONE function, not two objects
 *
 * `mix(ridge^9, ridge^3, detail)` times a radial window that collapses to a ring when far: at
 * detail 0 this is m compact knots on a ring, at detail 1 it is m open spiral ridges. Nothing
 * pops and nothing crossfades, and the near view is provably the far view refined rather than a
 * second object drawn on top. The integer powers are built by repeated multiplication — five
 * multiplies, cheaper than one `pow` — and each carries its own exact angular mean, so
 * `<sharp> = 1` holds for every value of `detail`.
 *
 * ## The flux invariant, and why it is provable
 *
 * The galaxy replaces the hub's sprite, so its flux-weighted integrated colour must equal
 * `KIND_COLORS[node.kind]` EXACTLY, at every level of detail. That is not a trick — it is what
 * integrated photometry is: a flat colour resolving into a warm bulge and a cool disc is what
 * happens when you point a bigger telescope at an unresolved galaxy. Drift here would mean a
 * folder changes identity as the camera approaches, which is the one defect that would make
 * this object worse than the gray dot it replaces.
 *
 * `warm` and `cool` are built on the CPU so that `BT*warm + (1-BT)*cool = base` holds per
 * channel, algebraically. The arm modulation cannot break it: `sharp` has unit mean and its
 * angular content lives at harmonics m, 2m, ...; `asym` has unit DC and lives at harmonics 1
 * and 2. For m >= 3 those are orthogonal over a full turn, so `<asym * sharp> = 1` exactly, and
 * `<armMod> = 0` exactly. This orthogonality is also why the asymmetry ships as two harmonics
 * instead of an indexed per-arm lookup: an indexed lookup has content at every harmonic of m,
 * correlates with the ridge, shifts the integrated colour, and adds a hard step at the
 * inter-arm midpoint.
 *
 * ⚠️ The asymmetry is evaluated on the UNWOUND angle `su`, never on raw theta. On raw theta the
 * bright side would be anchored to a fixed screen direction while the arms wind away from it,
 * so at 0.8 turns the "brightest arm" would not be the arm the file partition made brightest.
 *
 * ## Band limit
 *
 * `visible` fades the arms out when a knot is narrower than a couple of pixels, so an
 * unresolved spiral becomes a smooth disc instead of a moire of concentric rings. It is
 * ANALYTIC — the knot's angular FWHM in pixels — and deliberately not `fwidth` of the arm
 * phase: `fwidth` of a quantity derived from `atan` explodes on the branch cut at +-pi, which
 * is the exact class of artifact `ring-noise.js:8-11` exists to prevent.
 */
const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOmegaP;
  uniform float uGain;
  uniform float uDust;

  varying vec2 vP;
  varying vec4 vShape;
  varying vec4 vPose;
  varying vec4 vGain;
  varying vec4 vLod;
  varying vec4 vAsym;
  varying vec3 vWarm;
  varying vec3 vCool;

  const float TAU = 6.28318530718;
  const float CELLS = ${CELLS.toFixed(1)};
  const float RADIAL_PERIOD = 1024.0;
  // Luminance-neutral warm/cool axis under Rec.709. Derived on the CPU, baked here.
  const vec3 W = vec3(${W_AXIS[0].toFixed(4)}, ${W_AXIS[1].toFixed(4)}, ${W_AXIS[2].toFixed(4)});

  ${GLSL_PSNOISE}

  // Integer lacunarity in EVERY octave. The classic 2.01 (used against visible repetition)
  // would reopen the azimuthal seam at +-pi — the point ring-rig.js:63-65 already makes.
  float fbmSeg(vec2 q){
    float t = 0.500 * psnoise(q,       vec2(CELLS,       RADIAL_PERIOD));
    t +=      0.250 * psnoise(q * 2.0, vec2(CELLS * 2.0, RADIAL_PERIOD));
    t +=      0.125 * psnoise(q * 4.0, vec2(CELLS * 4.0, RADIAL_PERIOD));
    return t;
  }

  vec2 rotate(vec2 v, float c, float s){
    return vec2(v.x * c + v.y * s, -v.x * s + v.y * c);
  }

  void main(){
    float cosInc = vPose.x;
    // Screen-space ellipse: roll, then squash y. Camera-independent by construction.
    vec2 q = rotate(vP, cos(vPose.y), sin(vPose.y));
    q.y /= cosInc;
    float r = length(q);
    if (r > ${QUAD_SPAN.toFixed(3)}) discard;

    // The pattern phase doubles as the bar angle: when there is a bar the arms launch from its
    // ends, so the two are the SAME number and coupling them is the physics, not a shortcut.
    float th = atan(q.y, q.x) - vPose.z;

    // BULGE — projected Plummer, the exact projected surface density of a Plummer sphere.
    float x = r / vLod.w;
    float sb = 1.0 / (1.0 + x * x);
    float bulge = sb * sb * vGain.x;

    // DISC — exponential, softly truncated. A hard rim reads as geometry.
    float disk = exp(-${DISK_RATE.toFixed(1)} * r) * (1.0 - smoothstep(0.92, 1.28, r));

    // BAR — flat-topped in x, gaussian waist in y. At 20 px of disc radius a V2 bar is 15 px
    // long and ~4 px thick (arithmetic: 2*0.38*20 and 2*0.28*0.38*20), which is the only class
    // cue here SHARPER than the bloom veil rather than softer.
    float barLen = max(vShape.w, 0.001);
    vec2 b = rotate(q, cos(vPose.z), sin(vPose.z));
    float bx = b.x / barLen;
    float by = b.y / (barLen * ${BAR_AXIS.toFixed(2)});
    float bx2 = bx * bx;
    float bar = exp(-bx2 * bx2 - by * by) * vGain.y;

    // ---- ARM FIELD ----------------------------------------------------------------
    float m = max(vShape.x, 1.0);
    float rin = max(vShape.z, 0.001);
    float spin = vPose.w;
    // The unwound angle. ONE scalar, and the ONLY place uOmegaP appears. Curvature is frozen in
    // r; only the phase moves with time — which is what makes this a density wave instead of a
    // material structure that would wind up (Lin-Shu, catalog.js:235-240).
    float su = th - spin * (uOmegaP * uTime + log(max(r, rin) / rin) * vShape.y);
    float u = m * su;

    float ridge = 0.5 + 0.5 * cos(u);
    float r2 = ridge * ridge;
    float r4 = r2 * r2;
    float r8 = r4 * r4;
    float far  = (r8 * ridge) * ${(1 / MEAN_P9).toFixed(6)};
    float near = (r2 * ridge) * ${(1 / MEAN_P3).toFixed(6)};
    float sharp = mix(far, near, vLod.y);

    // Radial window: knots on a ring when far, the whole arm when near. Theta-independent, so
    // it redistributes the modulation radially and changes no angular mean.
    float g = (r - 0.62) / 0.13;
    float window = mix(exp(-g * g), 1.0, vLod.y);

    // Asymmetry from the file partition, on the UNWOUND angle. An arm that branches nothing is
    // dim, never missing: a density wave with no HII regions is still a density wave.
    float asym = 1.0 + vAsym.x * cos(su - vAsym.y) + vAsym.z * cos(2.0 * su - vAsym.w);

    // Band limit. The knot angular FWHM is 1.10/m rad (half-max of ridge^9 sits at
    // cos u = 0.852), which at radius r on a disc of vLod.x pixels is that many pixels across.
    float armPx = (1.10 / m) * r * vLod.x;
    float visible = smoothstep(1.2, 2.6, armPx);

    // The arms START at r_in, which for V2 and V3 is the bar length — that is what r_in MEANS.
    // Found on the bench: without this gate the log spiral has no winding left inside r_in
    // (log(r/r_in) -> 0), so the modulation degenerates into m STRAIGHT RADIAL SPOKES through
    // the nucleus and the object reads as a lens flare instead of a galaxy. Radial, therefore
    // theta-independent, therefore it changes no angular mean and the flux invariant holds.
    float launched = smoothstep(rin * 0.55, rin * 1.3, r);

    float armMod = vGain.w * asym * (sharp - 1.0) * window * visible * launched;

    // ---- TIER 2: dust lane, star-formation ridge, segmentation ---------------------
    vec3 diskTint = vCool;
    float t2 = vLod.z;
    if (t2 > 0.001) {
      // Segmentation. Multi-armed systems read as assemblies of segments that break and later
      // reconnect (Dobbs & Baba). psnoise closes in azimuth by construction: x is azimuth on an
      // INTEGER period, y is radius, the convention ring-noise.js fixed. Riding on su rather
      // than theta makes the segments follow the arms instead of sitting still under them.
      // The 1.0 + form keeps the mean at 1, so the segmentation does not shift the flux. That
      // is STATISTICAL — noise uncorrelated with the ridge — not exact the way the harmonic
      // asymmetry is, which is one more reason it is confined to the tier nobody sees at once.
      float seg = 1.0 + 0.6 * fbmSeg(vec2(su / TAU * CELLS, r * CELLS));
      armMod *= mix(1.0, seg, t2);

      // Both offsets are multiplied by SPIN, i.e. anchored to ROTATION and not to geometry:
      // material inside corotation overtakes the pattern and shocks on the upstream face. Flip
      // the pattern speed and the lane must swap sides — that is what makes this claim
      // falsifiable in one drag instead of a story.
      //
      // The offsets are in units of u, so 0.10 and 0.06 of a full inter-arm spacing regardless
      // of m. The star-formation offset is EXAGGERATED by ~15x: the measured offset is ~100 pc
      // from the dust lane, which at r = 8 kpc with m = 2 is 0.4% of the 25.1 kpc inter-arm
      // spacing (arithmetic). The ratio is preserved; the magnitude is legibility.
      // Deliberately NOT normalised to unit mean, unlike every other power here: this one is an
      // opacity, so it has to peak at 1. Normalising it would peak at 6.2 and drive the disc
      // term negative — extinction that emits light.
      float lc = 0.5 + 0.5 * cos(u + spin * 0.628319);
      float l2 = lc * lc;
      float l4 = l2 * l2;
      float l8 = l4 * l4;
      float lane = l8 * l4;

      float sc = 0.5 + 0.5 * cos(u - spin * 0.376991);
      float s2 = sc * sc;
      float s4 = s2 * s2;
      float s8 = s4 * s4;
      float sf = s8 * s2 * ${(1 / MEAN_P10).toFixed(6)};

      // The lane and the ridge are cited only INSIDE corotation. Rather than assert a flip that
      // cannot be cited, both fade out over the outer quarter of the disc — not knowing is
      // modelled as absence, not as a guess. They also stay out of the bulge, where extinction
      // by the disc's own dust is not what is being drawn.
      float lw = smoothstep(0.12, 0.28, r) * (1.0 - smoothstep(0.72, 0.98, r));

      // EXTINCTION, not a painted line: it removes light, so turning DUST off must make what is
      // behind it brighter. Mean depth is 0.45 * <lane^12> * <window> = 0.45*0.161*0.55, so it
      // costs ~4% of the disc's flux and reddens the integrated colour by about as much at this
      // tier — arithmetic, in the physically correct direction, and named here so that nobody
      // later "fixes" it back to an exact invariant that dust does not have.
      // The clamp is not decoration. seg reaches 1.525 (1.0 + 0.6 * the 0.875 amplitude sum of
      // fbmSeg's three octaves), so the factor goes negative once uDust passes ~1.45 — inside
      // the bench's 0..2.5 slider. An opacity below zero is a disc that EMITS: harmless here,
      // where the default framebuffer clamps it to black, and a dark hole punched through
      // whatever is behind it in the live composer's float target.
      disk *= max(0.0, 1.0 - 0.45 * uDust * lane * seg * lw * t2);

      // Zero-mean weight, so the integrated colour of the disc does not move when the knots
      // appear. Blue on the shock face, warm between: the nested split of the disc's own light.
      diskTint = vCool * (1.0 - ${K_SF.toFixed(3)} * W * ((sf - 1.0) * lw * ${SF_AMOUNT.toFixed(3)} * t2));
    }

    // max(0) only ever bites when the bench pushes ARM CONTRAST past its design range; at
    // ARM_AMP the factor bottoms out near 0.33 and the invariant above is untouched.
    float diskLight = disk * vGain.z * max(0.0, 1.0 + armMod);

    vec3 color = (vWarm * (bulge + bar) + diskTint * diskLight) * uGain;
    if (max(max(color.r, color.g), color.b) < 0.0015) discard;
    // Additive blending in r171 is blendFunc(SRC_ALPHA, ONE) (WebGLState.js:687), so alpha 1 is
    // exactly additive and the colour above is the light this galaxy contributes.
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Arm of one file. The seed is the PATH, never the index. */
function armOf(fileSource, arms) {
  return Math.min(arms - 1, Math.floor(hash01(fileSource, SALT_ARM) * arms));
}

/*
 * Synthetic child paths, for a caller that has a COUNT instead of a list — which is the bench
 * with a slider on it. Fabricating paths rather than fabricating a partition keeps the bench on
 * the real hash, so a slider produces a realistic imbalance instead of a tidy one.
 */
function fabricateSources(path, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(`${path}/#${i}`);
  return out;
}

/*
 * The file partition, as its lowest two angular Fourier components, normalised so the DC term
 * is 1.
 *
 * ⚠️ The reconstruction weight is NOT 2/m for both harmonics, and getting that wrong is a silent
 * doubling of the asymmetry. Sampling m arms at `theta_a = a*2pi/m` puts the Nyquist limit at
 * h = m/2:
 *
 * | m | h = 1 | h = 2 | recovered / total |
 * |---|---|---|---|
 * | 3 | 2/m | ALIASES onto h = 1 (cos(2*theta_a) == cos(theta_a)) — dropped | 3 / 3, exact |
 * | 4 | 2/m | h = m/2, the Nyquist mode: weight 1/m, and its sine part vanishes identically | 4 / 4, exact |
 * | 6 | 2/m | 2/m | 5 / 6, lossy |
 *
 * So this is EXACT for m = 3 and m = 4 — a weight vector of length m has m degrees of freedom
 * and the basis is complete in both cases. Only m = 6 loses one mode, the alternating +-1
 * pattern across arms, at an arm count where the eye cannot track individual arms anyway.
 *
 * Verified by reconstruction: for m = 4 and weights [1.3, 0.55, 0.55, 0.55] the formula below
 * gives `asym(0) = 1.76271`, and `w[0]/mean(w) = 1.3/0.7375 = 1.76271`.
 *
 * The lossy form is chosen over an exact indexed lookup on purpose: see the fragment header.
 * Orthogonality to the arm ridge is worth more than the sixth mode.
 */
function asymmetry(weights) {
  const m = weights.length;
  if (m < 3) return [0, 0, 0, 0];
  let dc = 0;
  let c1 = 0;
  let s1 = 0;
  let c2 = 0;
  let s2 = 0;
  for (let a = 0; a < m; a++) {
    const theta = (a * TAU) / m;
    dc += weights[a];
    c1 += weights[a] * Math.cos(theta);
    s1 += weights[a] * Math.sin(theta);
    c2 += weights[a] * Math.cos(2 * theta);
    s2 += weights[a] * Math.sin(2 * theta);
  }
  const scale = 1 / Math.max(dc, 1e-6);
  // h = 1 is below Nyquist for every m >= 3, so it always carries the factor 2.
  const a1 = 2 * Math.hypot(c1, s1) * scale;
  const a2 = m > 4 ? 2 * Math.hypot(c2, s2) * scale : m === 4 ? Math.hypot(c2, s2) * scale : 0;
  return [a1, Math.atan2(s1, c1), a2, Math.atan2(s2, c2)];
}

/**
 * Everything that defines the look of one galaxy, derived from the node. Pure and
 * deterministic, and frozen.
 *
 * Split from `createGalaxy` for the reason `planet.js:305-308` gives: the bench can spread over
 * one field (`{ ...galaxyParams(n, kids), arms: 6 }`) without reimplementing the derivation,
 * which is exactly what a bench cannot do without lying at the first divergence.
 *
 * `children` accepts either the array of child file sources (what the scene will pass) or a
 * plain count (what a slider passes).
 *
 * ⚠️ NOTHING PRODUCES THAT ARRAY YET, and the payload will not hand it over. Checked against
 * `GET /api/graph` on 2026-08-05: a hub node's keys are exactly
 * `id, type, label, kind, repo, dir, depth, chunks` — no `files` count (so the
 * `Number.isFinite(node.files)` fallback below is unreachable with real data), no children list,
 * and `graph.js` exposes no children API. The counts ARE derivable — match each file node's
 * `dir` against the hub's `dir`, which reproduces the histogram in `galaxy-classes.js` exactly —
 * but that derivation has to be WRITTEN, and it is the second thing owed before wiring.
 *
 * ⚠️ Hub nodes also carry no `source`, so `path` falls back to `node.id`. For most directories
 * that is a repo-relative path, but some are absolute and machine-local
 * (`dir:/Users/.../memory`), so those hubs get a different galaxy on a different machine. That
 * is inherited, not introduced: `graph.js:500-503` already seeds their orbits from the same id.
 *
 * `overrideClassId` exists ONLY so the bench can force a class and compare the four side by
 * side. The scene never passes it.
 *
 * @param {{source?: string, id?: string, kind?: string, files?: number}} node
 * @param {string[]|number} children
 * @param {string} [overrideClassId]
 * @returns {Readonly<object>}
 */
export function galaxyParams(node = {}, children = [], overrideClassId = null) {
  const path = node.source ?? node.id ?? 'no-path';
  const sources = Array.isArray(children)
    ? children
    : fabricateSources(path, Math.max(0, Math.round(Number.isFinite(children) ? children : 0)));
  const files = Array.isArray(children)
    ? children.length
    : sources.length || (Number.isFinite(node.files) ? node.files : 0);

  /*
   * MASS IS `chunks`, and this is where it decides the morphology.
   *
   * Concentration is the share of the direct-child mass held by the largest child — the analogue
   * of bulge-to-total, and the axis that beat both file count and mean density on the live corpus
   * (see `galaxy-classes.js`). A child without a mass counts as 1 so that a caller who only has
   * paths still gets a defined, even distribution instead of a division by zero.
   */
  const masses = sources.map((child) => {
    const chunks = typeof child === 'object' && child ? Number(child.chunks) : NaN;
    return Number.isFinite(chunks) && chunks > 0 ? chunks : 1;
  });
  const totalMass = masses.reduce((sum, mass) => sum + mass, 0);
  const concentration = totalMass > 0 ? Math.max(...masses) / totalMass : NaN;

  const auto = classForConcentration(concentration);
  const klass = overrideClassId
    ? GALAXY_CLASSES.find((entry) => entry.id === overrideClassId || entry.label === overrideClassId) ?? auto
    : auto;

  // The class proposes the arm count and the file count caps it: an arm is a GROUP of files, so
  // more arms than files would assert groups that are not there. `MIN_ARMS` forcing arms onto a
  // class that has none also has to lend it a winding geometry, or the "arms" would be m radial
  // spokes. V1's is the natural loan: it is the tightest.
  const arms = Math.max(MIN_ARMS, armsFor(klass, files));
  const geometry = klass.arms === 0 && arms > 0 ? GALAXY_CLASSES[1] : klass;

  const counts = new Array(arms).fill(0);
  // `armOf` hashes a PATH. A child arriving as `{source, chunks}` would stringify to
  // "[object Object]" and drop every file into the same arm — one fat arm and the rest empty,
  // with no error anywhere.
  if (arms > 0) {
    for (const child of sources) {
      counts[armOf(typeof child === 'string' ? child : child?.source ?? String(child), arms)] += 1;
    }
  }
  const peak = Math.max(1, ...counts);
  // 0.55 to 1.30, inside the ~0.6-1.3 per-arm amplitude the morphology reference prescribes. A
  // perfectly symmetric m-fold pattern is what makes a procedural galaxy read as procedural.
  const weights = counts.map((n) => 0.55 + 0.75 * (n / peak));

  const bt = klass.bulgeFraction;
  const barFrac = klass.barLen > 0 ? BAR_FRAC : 0;
  const k = klass.split;

  const base = new THREE.Color(KIND_COLORS[node.kind] ?? KIND_COLORS.dir);
  const warm = new THREE.Color();
  const cool = new THREE.Color();
  const rgb = ['r', 'g', 'b'];
  rgb.forEach((channel, i) => {
    // BT*warm + (1-BT)*cool = base, per channel, algebraically. Expand it and the k terms
    // cancel: BT*k*W*(1-BT) - (1-BT)*k*W*BT = 0.
    warm[channel] = base[channel] * (1 + k * W_AXIS[i] * (1 - bt));
    cool[channel] = base[channel] * (1 - k * W_AXIS[i] * bt);
  });

  return Object.freeze({
    path,
    files,
    // The mass that produced the class, and the class it produced. Both travel so the bench and
    // the probe can show WHY a body looks the way it does — a silhouette whose reason is not
    // readable anywhere is indistinguishable from a random one.
    mass: totalMass,
    concentration,
    class: klass,
    arms,
    counts: Object.freeze(counts),
    // The EXACT per-arm weights, kept on the CPU. They are the hook the future "highlight the
    // arm holding the focused file" interaction needs; shipping them to the GPU as two unused
    // vec3 attributes would be 6 floats per instance for a feature nobody has asked for yet.
    weights: Object.freeze(weights),
    asym: Object.freeze(asymmetry(weights)),
    invTanPitch: geometry.invTanPitch,
    pitchDeg: geometry.pitchDeg,
    rIn: geometry.rIn,
    turns: geometry.turns,
    barLen: klass.barLen,
    bulgeFraction: bt,
    // Inclination is a class cue here, not physics — see galaxy-classes.js.
    cosInc: klass.cosIncBase + klass.cosIncSpread * hash01(path, SALT_INC),
    roll: hash01(path, SALT_ROLL) * TAU,
    // One angle, two jobs: the bar's major axis and the phase the arms launch from.
    phase: hash01(path, SALT_PHASE) * TAU,
    spin: hash01(path, SALT_SPIN) < 0.5 ? -1 : 1,
    // The vertex divides this by the Plummer normalisation of the PIXEL-FLOORED core radius.
    bulgeLight: bt * (1 - barFrac),
    barGain: klass.barLen > 0 ? (bt * barFrac) / (BAR_AREA * klass.barLen * klass.barLen) : 0,
    diskGain: (1 - bt) / DISK_AREA,
    armAmp: arms > 0 ? ARM_AMP : 0,
    warm,
    cool,
    base,
  });
}

/**
 * Apparent radius of a disc, in pixels. The geometric projection, never `gl_PointSize`.
 *
 * `graph.js:741-747` records the measured reason: the sprite value saturates at the driver
 * ceiling of 511 and still oscillates with the ignition pulse — in the same pose it read 75 and
 * 153, crossing the planet's threshold of 90 in both directions, and the surface flickered.
 *
 * Exported so that the module and the bench cannot disagree about which number chose the tier.
 */
export function diskPx(radiusWorld, distance, viewportHeight, fov) {
  const half = Math.tan((fov * Math.PI) / 360) * Math.max(distance, 1e-4);
  return (radiusWorld * viewportHeight) / (2 * half);
}

/**
 * The galaxy field: one instanced draw for every hub in the sky.
 *
 * `{ object, update, dispose }`, like every other module in this layer. Nothing is allocated
 * here — geometry, material and buffers are born on the first non-empty `update`, the same
 * laziness `planet.js:369-372` and `ring-rock.js` use.
 */
export function createGalaxy(capacity = 96) {
  const group = new THREE.Group();

  let geometry = null;
  let material = null;
  let mesh = null;
  let slots = 0;
  const settings = { gain: 1, dust: 1, omega: OMEGA_P };
  const buffers = new Map();
  let center = null;
  let view = null;

  function build(size) {
    dispose();
    slots = size;
    geometry = new THREE.InstancedBufferGeometry();
    /*
     * The quad is written out rather than borrowed from `PlaneGeometry(2, 2)`: sharing the
     * attribute objects and then disposing the donor would fire that geometry's dispose event,
     * and `WebGLGeometries` releases the GL buffers of the attribute INSTANCES it holds — the
     * same instances this geometry would still be pointing at. Four vertices are not worth the
     * lifetime coupling.
     */
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3)
    );
    geometry.setIndex([0, 1, 2, 2, 1, 3]);

    center = new Float32Array(slots * 3);
    view = new Float32Array(slots * 4);
    geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(center, 3));
    geometry.setAttribute('aView', new THREE.InstancedBufferAttribute(view, 4));
    for (const [name, items] of STATIC_LAYOUT) {
      const array = new Float32Array(slots * items);
      buffers.set(name, array);
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, items));
    }
    /*
     * ⚠️ `InstancedBufferGeometry.instanceCount` defaults to **Infinity**
     * (r171/src/core/InstancedBufferGeometry.js:12). The renderer clamps it to
     * `_maxInstanceCount`, which is derived from the first instanced attribute only when
     * `object.isInstancedMesh !== true` (r171/src/renderers/webgl/WebGLBindingStates.js:403) —
     * so leaving it at the default would silently draw the whole capacity, empty slots
     * included. It is set explicitly on every update.
     */
    geometry.instanceCount = 0;

    material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOmegaP: { value: OMEGA_P },
        uGain: { value: 1 },
        uDust: { value: 1 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      // A galaxy is optically thin and never passes in front of a body it should darken, so
      // there is no extinction pass here — unlike the ring, which needs one (rings.js:182-192).
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    mesh = new THREE.Mesh(geometry, material);
    // The bounding sphere of a quad at the origin says nothing about where the instances are.
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    group.add(mesh);
  }

  /*
   * Write a static float and report whether it actually changed.
   *
   * The read-back after the write is deliberate: the array is Float32 and the incoming value is
   * a double, so comparing against the raw double would report a change on every frame from
   * rounding alone. This is the `haloOf` discipline (`graph.js:772-774`) — the CPU write is
   * free, the `needsUpdate` upload is not.
   */
  let dirty = false;
  function put(array, at, value) {
    const before = array[at];
    array[at] = value;
    if (array[at] !== before) dirty = true;
  }

  function writeStatic(i, p) {
    const shape = buffers.get('aShape');
    put(shape, i * 4, p.arms);
    put(shape, i * 4 + 1, p.invTanPitch);
    put(shape, i * 4 + 2, p.rIn);
    put(shape, i * 4 + 3, p.barLen);

    const pose = buffers.get('aPose');
    put(pose, i * 4, p.cosInc);
    put(pose, i * 4 + 1, p.roll);
    put(pose, i * 4 + 2, p.phase);
    put(pose, i * 4 + 3, p.spin);

    const gain = buffers.get('aGain');
    put(gain, i * 4, p.bulgeLight);
    put(gain, i * 4 + 1, p.barGain);
    put(gain, i * 4 + 2, p.diskGain);
    put(gain, i * 4 + 3, p.armAmp);

    const asym = buffers.get('aAsym');
    for (let c = 0; c < 4; c++) put(asym, i * 4 + c, p.asym[c]);

    const warm = buffers.get('aWarm');
    put(warm, i * 3, p.warm.r);
    put(warm, i * 3 + 1, p.warm.g);
    put(warm, i * 3 + 2, p.warm.b);

    const cool = buffers.get('aCool');
    put(cool, i * 3, p.cool.r);
    put(cool, i * 3 + 1, p.cool.g);
    put(cool, i * 3 + 2, p.cool.b);
  }

  function dispose() {
    if (!mesh) return;
    group.remove(mesh);
    material.dispose();
    geometry.dispose();
    buffers.clear();
    mesh = material = geometry = center = view = null;
    slots = 0;
  }

  return {
    object: group,

    /**
     * Live uniforms. `gain` scales the whole field; `dust` is the tier-2 extinction.
     *
     * Held in a plain object and pushed to the uniforms inside `update`, rather than written
     * straight through. The material does not exist until the first non-empty `update`, so a
     * caller that tunes before it updates — which is the natural order, and what the bench
     * does — would have its first frame silently ignore the tuning. Storing removes the
     * ordering requirement instead of documenting it.
     */
    tune({ gain = 1, dust = 1, omega = OMEGA_P } = {}) {
      settings.gain = gain;
      settings.dust = dust;
      settings.omega = omega;
    },

    /**
     * One frame of the whole field.
     *
     * @param {Array<{params: object, position: THREE.Vector3, radius: number}>} entries
     *   `position` and `radius` are in WORLD units, exactly as `graph.js:planetAnchor` returns
     *   them — it has ALREADY multiplied both by the graph group's scale (`graph.js:738-740`,
     *   and its own contract says "em unidades de MUNDO", `graph.js:731-732`). `radius` is the
     *   ANCHOR radius (the visible disc of the sprite); the galaxy disc is that times `SPAN`.
     *
     *   ⚠️ Therefore `object` belongs at the SCENE ROOT, the way `planet.object` is added
     *   (`scene.js:202-206`) from the same anchor. Parenting it under `graph.group` instead
     *   would apply `graphSpread` a second time — 2.6x by default (`tuning.js`) — putting every
     *   galaxy 2.6x too far out, 2.6x oversized, and two LOD tiers low. That is the arc bug of
     *   `scene.js:211-224` with the sign flipped, and it is why there is no `group.scale`
     *   compensation in here: the only correct wiring makes one unnecessary.
     * @param {THREE.Camera} camera
     * @param {number} viewportHeight  canvas FRAMEBUFFER height (`canvas.height`, i.e. CSS x
     *   devicePixelRatio) — the unit `scene.js:884-886` feeds `graph.update`, and the unit the
     *   whole LOD ladder below is written in. Passing the CSS height halves every pixel number.
     * @param {number} elapsed         scene clock, seconds
     * @returns {number} how many galaxies are at or above the arm threshold
     */
    update(entries, camera, viewportHeight, elapsed = 0) {
      const count = entries?.length ?? 0;
      if (count === 0) {
        group.visible = false;
        if (geometry) geometry.instanceCount = 0;
        return 0;
      }
      if (!mesh || slots < count) build(Math.max(capacity, count));
      group.visible = true;

      dirty = false;
      let resolved = 0;

      for (let i = 0; i < count; i++) {
        const entry = entries[i];
        // `entry` is already in world units (see the contract above), and the group sits at the
        // scene root, so there is nothing left to scale. `starRadius`'s `spread` factor
        // (`graph.js:319`) has no counterpart here on purpose: `planetAnchor` applied it.
        const radius = entry.radius * SPAN;
        const px = diskPx(
          radius,
          camera.position.distanceTo(entry.position),
          viewportHeight,
          camera.fov
        );

        center[i * 3] = entry.position.x;
        center[i * 3 + 1] = entry.position.y;
        center[i * 3 + 2] = entry.position.z;
        view[i * 4] = radius;
        view[i * 4 + 1] = px;
        // value FIRST — r171/src/math/MathUtils.js:84 is smoothstep(x, min, max), the OPPOSITE
        // of GLSL's smoothstep(edge0, edge1, x). Getting it backwards is a silent no-op.
        view[i * 4 + 2] = THREE.MathUtils.smoothstep(px, LOD_ARM_PX, LOD_TEX_PX);
        view[i * 4 + 3] = THREE.MathUtils.smoothstep(px, LOD_TEX_PX, LOD_FULL_PX);
        if (px >= LOD_ARM_PX) resolved += 1;

        writeStatic(i, entry.params);
      }

      geometry.instanceCount = count;
      geometry.getAttribute('aCenter').needsUpdate = true;
      geometry.getAttribute('aView').needsUpdate = true;
      if (dirty) for (const [name] of STATIC_LAYOUT) geometry.getAttribute(name).needsUpdate = true;
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uGain.value = settings.gain;
      material.uniforms.uDust.value = settings.dust;
      material.uniforms.uOmegaP.value = settings.omega;

      return resolved;
    },

    count: () => (geometry ? geometry.instanceCount : 0),

    dispose,
  };
}
