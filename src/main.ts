import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SkeletonHelper } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import Stats from 'stats.js';

/**
 * Real-time Scene Loader
 * 
 * Workflow:
 * - Single GLB file contains everything: character, environment, animations, and camera
 * - In Blender, linked collections (CHAR, ENV) are assembled in an RT_SCENE file
 * - Camera positioning and animation are done in the RT_SCENE file
 * - Export as one GLB to /public/RT_SCENE_*.glb
 * 
 * Features:
 * - Loads complete scene from single GLB file
 * - Extracts camera position, rotation, FOV from GLB and applies to Three.js camera
 * - Automatically identifies character (SkinnedMesh) and environment collections
 * - Creates one AnimationMixer per character root
 * - Supports multiple animation clips with smooth crossfading
 * - Debug helpers to inspect animations and skeleton
 * 
 * Usage:
 * - playAnimation(characterRoot, 'AnimationName', loop = true, crossfadeDuration = 0.3)
 * - stopAnimation(characterRoot, fadeOutDuration = 0.3)
 * - debugListClips(clips) - logs all available animations
 * 
 * Common Issues:
 * - If character stays in T-pose: Animation may only contain shape key/morph target data
 *   Fix: In Blender, ensure bone keyframes exist and "Bake Animation" is enabled in GLB export
 */

interface AnimationState {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentAction: THREE.AnimationAction | null;
}

const animationStates = new Map<THREE.Object3D, AnimationState>();

// Stats panel - will be integrated into debug panel
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb

// Debug helpers
let skeletonHelper: THREE.SkeletonHelper | null = null;
let currentCharacterRoot: THREE.Object3D | null = null;

// Scene management
let sceneRoot: THREE.Group | null = null;
let characterRoot: THREE.Object3D | null = null;
let environmentRoot: THREE.Object3D | null = null;
let environmentMaterialsBackup: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ 
  canvas, 
  antialias: true,
  powerPreference: 'high-performance', // Use dedicated GPU if available
  stencil: false, // Disable stencil buffer if not needed
});
// Cap pixel ratio to reduce rendering load (especially on Retina/4K displays)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5; // Boost exposure to brighten emissive materials

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Will be updated when skydome loads

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(4, 3, 6);

// Mouse-follow camera system (replaces OrbitControls)
// Camera stays at fixed position but rotates to follow cursor
let mouseX = 0;
let mouseY = 0;
const mouseSensitivity = 1.0; // Max offset distance in world units
const parallaxAmount = 0.15; // Subtle camera translation for parallax effect (world units)
const smoothing = 0.08; // Lower = smoother but slower response

// Store the original camera position and look-at target from GLB
let originalCameraPosition = new THREE.Vector3();
let originalLookAtTarget = new THREE.Vector3();
let currentLookAtTarget = new THREE.Vector3();

// Zoom system
let isZooming = false;
let zoomProgress = 0;
const zoomSpeed = 0.05; // How fast to zoom in/out (much slower, was 0.15)
const zoomAmount = 0.3; // How much to zoom (0.3 = 30% closer, reduced by 50%)

// Track mouse movement
window.addEventListener('mousemove', (event) => {
  // Normalize mouse position to -1 to 1 range
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1; // Invert Y axis
});

// Track mouse clicks for zoom
canvas.addEventListener('mousedown', () => {
  isZooming = true;
});

canvas.addEventListener('mouseup', () => {
  isZooming = false;
});

canvas.addEventListener('mouseleave', () => {
  isZooming = false;
});

// Enable shadow rendering
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Hemisphere light for fake GI - will be updated with skydome color
const ambientFill = new THREE.HemisphereLight(
  0x87ceeb, // Default sky color (will be replaced with skydome emissive)
  0x3a2a1f, // Ground color - dark warm tone
  1.2       // Intensity (increased for softer overall lighting)
);
scene.add(ambientFill);

const gltf = new GLTFLoader();
const ktx2 = new KTX2Loader()
  .setTranscoderPath('https://unpkg.com/three/examples/jsm/libs/basis/')
  .detectSupport(renderer);
gltf.setKTX2Loader(ktx2);
gltf.setMeshoptDecoder(MeshoptDecoder as any);

// Animation helper functions
function debugListClips(clips: THREE.AnimationClip[]): void {
  console.log('\n🎬 Available animation clips:', clips.length);
  clips.forEach((clip, idx) => {
    console.log(`\n  [${idx}] "${clip.name}"`);
    console.log(`      Duration: ${clip.duration.toFixed(2)}s`);
    console.log(`      Total Tracks: ${clip.tracks.length}`);
    
    // Categorize tracks
    const trackTypes = {
      position: 0,
      quaternion: 0,
      scale: 0,
      morphTarget: 0,
      other: 0
    };
    
    clip.tracks.forEach(track => {
      if (track.name.includes('.position')) trackTypes.position++;
      else if (track.name.includes('.quaternion')) trackTypes.quaternion++;
      else if (track.name.includes('.scale')) trackTypes.scale++;
      else if (track.name.includes('morphTarget')) trackTypes.morphTarget++;
      else trackTypes.other++;
    });
    
    console.log(`      Track breakdown:`);
    console.log(`        - Position: ${trackTypes.position}`);
    console.log(`        - Quaternion: ${trackTypes.quaternion}`);
    console.log(`        - Scale: ${trackTypes.scale}`);
    console.log(`        - Morph Targets: ${trackTypes.morphTarget}`);
    console.log(`        - Other: ${trackTypes.other}`);
    
    if (clip.tracks.length > 0 && clip.tracks.length <= 5) {
      console.log(`      All track names:`, clip.tracks.map(t => t.name));
    }
  });
  console.log('');
}

function setupAnimationMixer(
  root: THREE.Object3D,
  clips: THREE.AnimationClip[]
): AnimationState {
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, THREE.AnimationAction>();
  
  // Create actions for all clips
  clips.forEach(clip => {
    const action = mixer.clipAction(clip);
    actions.set(clip.name, action);
  });
  
  const state: AnimationState = {
    mixer,
    actions,
    currentAction: null
  };
  
  animationStates.set(root, state);
  return state;
}

function playAnimation(
  root: THREE.Object3D,
  clipName: string,
  loop: boolean = true,
  crossfadeDuration: number = 0.3
): THREE.AnimationAction | null {
  const state = animationStates.get(root);
  if (!state) {
    console.warn('No animation state found for object');
    return null;
  }
  
  const action = state.actions.get(clipName);
  if (!action) {
    console.warn(`Animation clip "${clipName}" not found. Available clips:`, Array.from(state.actions.keys()));
    return null;
  }
  
  // Handle crossfade if there's a current action playing
  if (state.currentAction && state.currentAction !== action) {
    const prevAction = state.currentAction;
    prevAction.fadeOut(crossfadeDuration);
    action.reset().fadeIn(crossfadeDuration);
  } else {
    action.reset();
  }
  
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = false;
  action.enabled = true;
  action.play();
  
  state.currentAction = action;
  console.log(`✓ Playing animation: "${clipName}" (duration: ${action.getClip().duration.toFixed(2)}s, loop: ${loop})`);
  
  return action;
}

function stopAnimation(root: THREE.Object3D, fadeOutDuration: number = 0.3): void {
  const state = animationStates.get(root);
  if (!state || !state.currentAction) return;
  
  state.currentAction.fadeOut(fadeOutDuration);
  state.currentAction = null;
}


function applyGrayMaterialToEnvironment(): void {
  if (!environmentRoot) {
    console.warn('No environment loaded');
    return;
  }
  
  // Create a simple gray material
  const grayMaterial = new THREE.MeshStandardMaterial({
    color: 0x808080,
    roughness: 0.8,
    metalness: 0.2
  });
  
  let meshCount = 0;
  environmentRoot.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      // Backup original material if not already backed up
      if (!environmentMaterialsBackup.has(obj)) {
        environmentMaterialsBackup.set(obj, obj.material);
      }
      obj.material = grayMaterial;
      meshCount++;
    }
  });
  
  console.log(`✓ Applied gray material to ${meshCount} environment meshes`);
}

function restoreEnvironmentMaterials(): void {
  if (!environmentRoot) {
    console.warn('No environment loaded');
    return;
  }
  
  let meshCount = 0;
  environmentRoot.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh && environmentMaterialsBackup.has(obj)) {
      obj.material = environmentMaterialsBackup.get(obj)!;
      meshCount++;
    }
  });
  
  environmentMaterialsBackup.clear();
  console.log(`✓ Restored original materials to ${meshCount} environment meshes`);
}

function toggleSkeleton(visible: boolean): void {
  if (!currentCharacterRoot) {
    console.warn('No character loaded');
    return;
  }
  
  if (visible && !skeletonHelper) {
    // Strategy 1: Try to find SkinnedMesh
    currentCharacterRoot.traverse((obj: THREE.Object3D) => {
      if (!skeletonHelper && obj instanceof THREE.SkinnedMesh && obj.skeleton) {
        skeletonHelper = new THREE.SkeletonHelper(obj.skeleton.bones[0].parent || obj);
        (skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 3;
        scene.add(skeletonHelper);
        console.log('✓ Skeleton helper created from SkinnedMesh, bones:', obj.skeleton.bones.length);
        return;
      }
    });
    
    // Strategy 2: If no SkinnedMesh, try to find any Bone and create helper from armature
    if (!skeletonHelper) {
      let armatureRoot: THREE.Object3D | null = null;
      currentCharacterRoot.traverse((obj: THREE.Object3D) => {
        if (!armatureRoot && obj instanceof THREE.Bone) {
          // Find the root bone (topmost parent that's still a bone)
          let current = obj;
          while (current.parent && current.parent instanceof THREE.Bone) {
            current = current.parent as THREE.Bone;
          }
          armatureRoot = current.parent || current;
        }
      });
      
      if (armatureRoot) {
        skeletonHelper = new THREE.SkeletonHelper(armatureRoot);
        (skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 3;
        scene.add(skeletonHelper);
        console.log('✓ Skeleton helper created from bone hierarchy');
      } else {
        // Strategy 3: Look for DEF_ objects (Rigify deform bones exported as Object3D)
        currentCharacterRoot.traverse((obj: THREE.Object3D) => {
          if (!armatureRoot && obj.name.startsWith('DEF_') && obj.name === 'DEF_hip') {
            armatureRoot = obj.parent || obj; // Use armature root
          }
        });
        
        if (armatureRoot) {
          skeletonHelper = new THREE.SkeletonHelper(armatureRoot);
          (skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 3;
          scene.add(skeletonHelper);
          console.log('✓ Skeleton helper created from Object3D bone hierarchy (Rigify)');
          console.warn('⚠️ WARNING: Bones exported as Object3D, not THREE.Bone');
          console.warn('   Meshes are not skinned! Animation will move bones but not deform mesh.');
          console.warn('   Re-export from Blender with proper skinning enabled.');
        } else {
          console.warn('⚠️ No skeleton or bones found in character');
        }
      }
    }
  } else if (!visible && skeletonHelper) {
    scene.remove(skeletonHelper);
    skeletonHelper = null;
    console.log('✓ Skeleton helper hidden');
  }
}


function createUI(clips: THREE.AnimationClip[]): void {
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 0;
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
    min-width: 250px;
    max-width: 300px;
    overflow: hidden;
  `;
  
  // Header with toggle
  const header = document.createElement('div');
  header.style.cssText = `
    font-weight: bold;
    font-size: 14px;
    padding: 12px 15px;
    cursor: pointer;
    user-select: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
  `;
  
  const title = document.createElement('span');
  title.textContent = '⚙️ Debug Controls';
  
  const toggleIcon = document.createElement('span');
  toggleIcon.textContent = '▼';
  toggleIcon.style.cssText = `
    font-size: 10px;
    transition: transform 0.2s;
    transform: rotate(-90deg);
  `;
  
  header.appendChild(title);
  header.appendChild(toggleIcon);
  panel.appendChild(header);
  
  // Content container
  const content = document.createElement('div');
  content.style.cssText = `
    display: none;
    padding: 15px;
  `;
  panel.appendChild(content);
  
  // Toggle functionality
  let isExpanded = false;
  header.onclick = () => {
    isExpanded = !isExpanded;
    content.style.display = isExpanded ? 'block' : 'none';
    toggleIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
  };
  
  // FPS counter display (integrated stats.js) - full width
  const fpsDisplay = document.createElement('div');
  fpsDisplay.style.cssText = `
    margin-bottom: 12px;
    background: rgba(0, 100, 200, 0.2);
    border-radius: 4px;
    border: 1px solid rgba(0, 150, 255, 0.3);
    padding: 4px;
    height: 56px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  // Configure stats.js to render at a specific size
  stats.dom.style.position = 'relative';
  stats.dom.style.width = '100%';
  stats.dom.style.height = '48px';
  
  fpsDisplay.appendChild(stats.dom);
  content.appendChild(fpsDisplay);
  
  // FPS limiter control
  const fpsControl = document.createElement('div');
  fpsControl.style.cssText = `
    margin-bottom: 12px;
    padding: 8px;
    background: rgba(50, 50, 50, 0.5);
    border-radius: 4px;
  `;
  
  const fpsLabel = document.createElement('label');
  fpsLabel.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
  `;
  
  const fpsText = document.createElement('span');
  fpsText.textContent = `FPS Cap: ${targetFPS}`;
  fpsText.style.fontSize = '11px';
  fpsText.style.opacity = '0.8';
  
  const fpsSlider = document.createElement('input');
  fpsSlider.type = 'range';
  fpsSlider.min = '30';
  fpsSlider.max = '120';
  fpsSlider.value = targetFPS.toString();
  fpsSlider.step = '10';
  fpsSlider.style.cssText = `
    width: 100%;
    cursor: pointer;
  `;
  
  fpsSlider.oninput = (e) => {
    targetFPS = parseInt((e.target as HTMLInputElement).value);
    frameInterval = 1000 / targetFPS;
    fpsText.textContent = `FPS Cap: ${targetFPS}`;
  };
  
  fpsLabel.appendChild(fpsText);
  fpsLabel.appendChild(fpsSlider);
  fpsControl.appendChild(fpsLabel);
  content.appendChild(fpsControl);
  
  // Environment toggle
  const envToggle = document.createElement('label');
  envToggle.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    cursor: pointer;
  `;
  const envCheckbox = document.createElement('input');
  envCheckbox.type = 'checkbox';
  envCheckbox.checked = true;
  envCheckbox.onchange = (e) => {
    if (environmentRoot) {
      environmentRoot.visible = (e.target as HTMLInputElement).checked;
    }
  };
  envCheckbox.style.cursor = 'pointer';
  envToggle.appendChild(envCheckbox);
  const envLabel = document.createElement('span');
  envLabel.textContent = 'Show Environment';
  envToggle.appendChild(envLabel);
  content.appendChild(envToggle);
  
  // Skeleton toggle
  const skeletonToggle = document.createElement('label');
  skeletonToggle.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    cursor: pointer;
  `;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.onchange = (e) => toggleSkeleton((e.target as HTMLInputElement).checked);
  checkbox.style.cursor = 'pointer';
  skeletonToggle.appendChild(checkbox);
  const label = document.createElement('span');
  label.textContent = 'Show Skeleton';
  skeletonToggle.appendChild(label);
  content.appendChild(skeletonToggle);
  
  // Gray material button
  const grayBtn = document.createElement('button');
  grayBtn.textContent = '🎨 Gray Environment Material';
  grayBtn.style.cssText = `
    width: 100%;
    padding: 8px;
    margin-top: 4px;
    background: rgba(150, 150, 150, 0.2);
    color: white;
    border: 1px solid rgba(150, 150, 150, 0.4);
    border-radius: 4px;
    cursor: pointer;
    font-family: monospace;
    font-size: 11px;
  `;
  let grayApplied = false;
  grayBtn.onclick = () => {
    if (!grayApplied) {
      applyGrayMaterialToEnvironment();
      grayBtn.textContent = '🎨 Restore Materials';
      grayBtn.style.background = 'rgba(150, 150, 150, 0.4)';
      grayApplied = true;
    } else {
      restoreEnvironmentMaterials();
      grayBtn.textContent = '🎨 Gray Environment Material';
      grayBtn.style.background = 'rgba(150, 150, 150, 0.2)';
      grayApplied = false;
    }
  };
  content.appendChild(grayBtn);
  
  // Animation buttons section
  if (clips.length > 0) {
    // Check if animations have bone transforms
    const hasBoneAnimations = clips.some(clip => 
      clip.tracks.some(track => 
        track.name.includes('.position') || 
        track.name.includes('.quaternion') || 
        track.name.includes('.scale')
      )
    );
    
    // Warning if no bone animations
    if (!hasBoneAnimations) {
      const warningBox = document.createElement('div');
      warningBox.textContent = '⚠️ Animations missing bone data - check console';
      warningBox.style.cssText = `
        margin-top: 15px;
        margin-bottom: 8px;
        padding: 8px;
        background: rgba(200, 50, 50, 0.3);
        border: 1px solid rgba(255, 100, 100, 0.5);
        border-radius: 4px;
        font-size: 10px;
        color: #ffcccc;
        text-align: center;
        cursor: help;
      `;
      warningBox.title = 'Animation GLB only contains shape keys/morph targets. Re-export with bone keyframes from Blender.';
      content.appendChild(warningBox);
    }
    
    const animTitle = document.createElement('div');
    animTitle.textContent = 'Animations:';
    animTitle.style.cssText = `
      margin-top: 15px;
      margin-bottom: 8px;
      opacity: 0.7;
      font-size: 11px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      padding-top: 10px;
    `;
    content.appendChild(animTitle);
    
    clips.forEach(clip => {
      const btn = document.createElement('button');
      btn.textContent = clip.name;
      btn.dataset.clipName = clip.name;
      btn.style.cssText = `
        width: 100%;
        padding: 8px;
        margin-bottom: 5px;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        cursor: pointer;
        font-family: monospace;
        font-size: 11px;
        transition: all 0.2s;
      `;
      
      btn.onmouseenter = () => {
        btn.style.background = 'rgba(255, 255, 255, 0.2)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
      };
      
      btn.onmouseleave = () => {
        const state = currentCharacterRoot && animationStates.get(currentCharacterRoot);
        const isPlaying = state?.currentAction?.getClip().name === clip.name;
        btn.style.background = isPlaying ? 'rgba(100, 200, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)';
        btn.style.borderColor = isPlaying ? 'rgba(100, 200, 100, 0.6)' : 'rgba(255, 255, 255, 0.3)';
      };
      
      btn.onclick = () => {
        console.log(`🎬 Button clicked for animation: "${clip.name}"`);
        if (currentCharacterRoot) {
          const result = playAnimation(currentCharacterRoot, clip.name, true);
          console.log(`Animation play result:`, result ? 'Success' : 'Failed');
          
          // Update all button states
          content.querySelectorAll('button[data-clip-name]').forEach(b => {
            const isActive = (b as HTMLButtonElement).dataset.clipName === clip.name;
            (b as HTMLElement).style.background = isActive ? 'rgba(100, 200, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)';
            (b as HTMLElement).style.borderColor = isActive ? 'rgba(100, 200, 100, 0.6)' : 'rgba(255, 255, 255, 0.3)';
          });
        } else {
          console.error('No character root found!');
        }
      };
      
      content.appendChild(btn);
      
      // Highlight currently playing animation
      const state = currentCharacterRoot && animationStates.get(currentCharacterRoot);
      if (state?.currentAction?.getClip().name === clip.name) {
        btn.style.background = 'rgba(100, 200, 100, 0.3)';
        btn.style.borderColor = 'rgba(100, 200, 100, 0.6)';
      }
    });
  } else {
    const noAnims = document.createElement('div');
    noAnims.textContent = 'No animations found';
    noAnims.style.cssText = `
      margin-top: 10px;
      opacity: 0.5;
      font-size: 10px;
    `;
    content.appendChild(noAnims);
  }
  
  document.body.appendChild(panel);
}

async function loadAll(): Promise<void> {
  console.log('🎬 Loading scene components...');
  
  // Load environment from ENV_MASTER
  console.log('  🏢 Loading environment GLB...');
  const envGltf = await gltf.loadAsync('/ENV_ApeEscapeOffice.glb');
  console.log(`    ✓ Environment loaded (${envGltf.scenes[0].children.length} root objects)`);
  
  // Load character from CHAR_MASTER
  console.log('  🦍 Loading character GLB...');
  const charGltf = await gltf.loadAsync('/CHAR_MrProBonobo.glb');
  console.log(`    ✓ Character loaded (${charGltf.animations.length} animations)`);
  
  // Load scene (camera + animations) from RT_ANIM
  console.log('  📷 Loading scene GLB (camera + animations)...');
  const sceneGltf = await gltf.loadAsync('/RT_SCENE_ApeEscape.glb');
  console.log(`    ✓ Scene loaded (${sceneGltf.animations.length} animation clips)`);
  
  // Add environment to scene
  sceneRoot = envGltf.scene;
  scene.add(sceneRoot);
  console.log(`  → Environment root at: (${sceneRoot.position.x.toFixed(3)}, ${sceneRoot.position.y.toFixed(3)}, ${sceneRoot.position.z.toFixed(3)})`);
  
  // Find character's intended position from RT_SCENE
  // (The RT_SCENE file has the character positioned on the chair)
  let charPosition = new THREE.Vector3(0, 0, 0);
  let charRotation = new THREE.Quaternion();
  let charScale = new THREE.Vector3(1, 1, 1);
  
  console.log('\n📍 Positioning character...');
  
  // First, try to find character armature position from RT_SCENE GLB
  let foundArmaturePosition = false;
  sceneGltf.scene.traverse((obj: THREE.Object3D) => {
    if (obj.name && obj.name.includes('Armature_MrProBonobo') && !foundArmaturePosition) {
      obj.getWorldPosition(charPosition);
      obj.getWorldQuaternion(charRotation);
      obj.getWorldScale(charScale);
      foundArmaturePosition = true;
      console.log(`  ✓ Using character armature position from RT_SCENE`);
      console.log(`    Position: (${charPosition.x.toFixed(2)}, ${charPosition.y.toFixed(2)}, ${charPosition.z.toFixed(2)})`);
    }
  });
  
  // Fallback: use office chair position if no armature found
  if (!foundArmaturePosition) {
    envGltf.scene.traverse((obj: THREE.Object3D) => {
      if (obj.name && obj.name.includes('Office_Chair_Instance')) {
        // Get both local and world positions to see if there's a parent offset
        const localPos = obj.position.clone();
        obj.getWorldPosition(charPosition);
        obj.getWorldQuaternion(charRotation);
        obj.getWorldScale(charScale);
        console.log(`  ✓ Using office chair position (no armature in RT_SCENE)`);
        console.log(`    Chair local: (${localPos.x.toFixed(2)}, ${localPos.y.toFixed(2)}, ${localPos.z.toFixed(2)})`);
        console.log(`    Chair world: (${charPosition.x.toFixed(2)}, ${charPosition.y.toFixed(2)}, ${charPosition.z.toFixed(2)})`);
        
        // Also check if the chair's parent has an offset
        if (obj.parent && obj.parent !== envGltf.scene) {
          const parentWorldPos = new THREE.Vector3();
          obj.parent.getWorldPosition(parentWorldPos);
          console.log(`    Parent world: (${parentWorldPos.x.toFixed(2)}, ${parentWorldPos.y.toFixed(2)}, ${parentWorldPos.z.toFixed(2)})`);
        }
      }
    });
  }
  
  // Add character to scene
  charGltf.scene.position.copy(charPosition);
  charGltf.scene.quaternion.copy(charRotation);
  charGltf.scene.scale.copy(charScale);
  scene.add(charGltf.scene);
  console.log(`  → Character placed at Y: ${charGltf.scene.position.y.toFixed(3)}m`);
  
  // Find and extract camera from the GLB
  console.log('\n📷 Setting up camera...');
  let glbCamera: THREE.Camera | null = null;
  
  if (sceneGltf.cameras && sceneGltf.cameras.length > 0) {
    glbCamera = sceneGltf.cameras[0];
    
    // Find camera in scene hierarchy to get its transform
    sceneGltf.scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Camera && obj.uuid === glbCamera!.uuid) {
        glbCamera = obj;
      }
    });
  } else {
    // Fallback: search in scene hierarchy
    sceneGltf.scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Camera && !glbCamera) {
        glbCamera = obj;
      }
    });
  }
  
  // Apply camera position and orientation from GLB to our main camera
  if (glbCamera) {
    camera.position.copy(glbCamera.position);
    camera.rotation.copy(glbCamera.rotation);
    camera.quaternion.copy(glbCamera.quaternion);
    
    // Store original camera position for mouse-follow system
    originalCameraPosition.copy(glbCamera.position);
    
    // Calculate the original look-at target by projecting forward from camera
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(glbCamera.quaternion);
    const lookDistance = 5; // Distance to look-at point
    originalLookAtTarget.copy(glbCamera.position).add(forward.multiplyScalar(lookDistance));
    currentLookAtTarget.copy(originalLookAtTarget);
    
    // If it's a perspective camera, also copy FOV and other properties
    if (glbCamera instanceof THREE.PerspectiveCamera) {
      camera.fov = glbCamera.fov;
      camera.near = glbCamera.near;
      camera.far = glbCamera.far;
      camera.updateProjectionMatrix();
    }
    
    console.log('  ✓ Camera configured from GLB');
  } else {
    console.warn('  ⚠️ No camera found in GLB, using default');
  }
  
  // Find character skeleton and check for mesh offsets
  let skinnedMeshes: THREE.SkinnedMesh[] = [];
  charGltf.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.SkinnedMesh) {
      skinnedMeshes.push(obj);
      // Check if mesh has a local position offset
      console.log(`\n🔍 Character mesh "${obj.name}" local position: (${obj.position.x.toFixed(3)}, ${obj.position.y.toFixed(3)}, ${obj.position.z.toFixed(3)})`);
      
      // Check parent hierarchy
      let parent = obj.parent;
      let depth = 0;
      while (parent && depth < 3) {
        console.log(`  Parent ${depth}: "${parent.name}" at (${parent.position.x.toFixed(3)}, ${parent.position.y.toFixed(3)}, ${parent.position.z.toFixed(3)})`);
        parent = parent.parent;
        depth++;
      }
    }
  });
    
  if (skinnedMeshes.length > 0) {
    characterRoot = charGltf.scene;
    currentCharacterRoot = charGltf.scene;
  } else {
    console.error('❌ No character skeleton found!');
  }
  
  // Find environment root from scene GLB
  sceneGltf.scene.traverse((obj: THREE.Object3D) => {
    if (!environmentRoot) {
      const envPatterns = ['ENV', 'Environment', 'Sea_Pod', 'Office'];
      const matchesEnv = envPatterns.some(pattern => obj.name.includes(pattern));
      if (matchesEnv) {
        environmentRoot = obj;
      }
    }
  });
  
  if (environmentRoot) {
    console.log('  ✓ Environment root found:', environmentRoot.name);
  }
  
  // Combine animations from both GLBs
  const allClips = [...sceneGltf.animations, ...charGltf.animations];
  console.log(`\n🎬 Animations: ${allClips.length} clips loaded`);
  
  // Check ROOT bone values in animation
  allClips.forEach(clip => {
    const rootTrack = clip.tracks.find(track => track.name === 'ROOT.position');
    if (rootTrack && rootTrack.values) {
      // Log the Y value (index 1) of the first keyframe
      const firstY = rootTrack.values[1];
      if (Math.abs(firstY) > 0.01) {
        console.log(`  ⚠️ ROOT Y offset in "${clip.name}": ${firstY.toFixed(3)}m`);
      }
    }
  });
  
  if (currentCharacterRoot && allClips.length > 0) {
    // Create animation mixer
    setupAnimationMixer(currentCharacterRoot, allClips);
    
    // Auto-play first animation
    if (allClips.length > 0) {
      playAnimation(currentCharacterRoot, allClips[0].name, true);
      console.log(`  ✓ Playing "${allClips[0].name}"`);
    }
  }
  
  // Process all objects: enable shadows and adjust materials/lights
  console.log('\n🎨 Processing materials and lights...');
  let skydomeFound = false;
  
  [envGltf.scene, charGltf.scene].forEach(root => {
    root.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        const m = (obj as any).material;
        if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        
        // Handle skydome and ocean backdrop materials
        if ((obj.name === 'Skydome' || obj.name === 'Ocean') && m) {
          // For skydome, replace with unlit material
          if (obj.name === 'Skydome') {
            const skydomeMaterial = new THREE.MeshBasicMaterial({
              color: m.emissive.clone(),
              side: THREE.BackSide,
              fog: false,
              depthWrite: false,
            });
            obj.material = skydomeMaterial;
            obj.renderOrder = -1;
            obj.frustumCulled = false;
            
            // Set scene background to sky color
            ambientFill.color.copy(m.emissive);
            scene.background = m.emissive.clone();
            console.log(`  ✓ Skydome configured (background: #${m.emissive.getHexString()})`);
            skydomeFound = true;
          } else if (obj.name === 'Ocean') {
            // Ocean: boost emissive and disable culling
            if (m.emissive && m.emissive.r === 0 && m.emissive.g === 0 && m.emissive.b === 0) {
              m.emissive.copy(m.color);
            }
            m.emissiveIntensity = 20;
            obj.frustumCulled = false;
            console.log(`  ✓ Ocean configured (emissive boosted)`);
          }
          
          // Don't cast shadows from backdrop
          obj.castShadow = false;
        }
      }
      
      // Adjust directional light intensity from GLB
      if (obj instanceof THREE.DirectionalLight) {
        obj.intensity = obj.intensity / 2000; // 2000x reduction for softer shadows
        obj.castShadow = true;
        
        // Adaptive shadow quality based on device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const shadowMapSize = isMobile ? 1024 : 2048;
        
        obj.shadow.mapSize.width = shadowMapSize;
        obj.shadow.mapSize.height = shadowMapSize;
        obj.shadow.camera.near = 0.1;
        obj.shadow.camera.far = 16;
        obj.shadow.camera.left = -8;
        obj.shadow.camera.right = 8;
        obj.shadow.camera.top = 8;
        obj.shadow.camera.bottom = -8;
        obj.shadow.bias = -0.0001;
        obj.shadow.normalBias = 0.02;
      }
    });
  });
  
  if (!skydomeFound) {
    console.warn('  ⚠️ Skydome not found - using default hemisphere light color');
  }
  
  // Verify character structure
  if (currentCharacterRoot) {
    let hasSkeleton = false;
    let meshCount = 0;
    let skinnedMeshCount = 0;
    let totalBones = 0;
    
    currentCharacterRoot.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.SkinnedMesh) {
        skinnedMeshCount++;
        hasSkeleton = true;
        totalBones = obj.skeleton?.bones.length || 0;
        // Character skeleton verified
      } else if (obj instanceof THREE.Mesh) {
        meshCount++;
      }
    });
    
    if (!hasSkeleton) {
      console.warn('  ⚠️ Character has no skeleton - animations may not work');
    }
  }
  
  // Create UI controls after loading
  createUI(allClips);
  
  // Final position check
  console.log('\n📊 Final position check:');
  console.log(`  Environment Y: ${sceneRoot?.position.y.toFixed(3)}m`);
  console.log(`  Character Y: ${charGltf.scene.position.y.toFixed(3)}m`);
  
  console.log('\n✅ Scene loaded successfully');
}
loadAll().catch(err => {
  console.error('Error loading models:', err);
});

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// Track time for mixer updates
const clock = new THREE.Clock();

// Performance: Cap framerate to 60 FPS
let targetFPS = 60;
let frameInterval = 1000 / targetFPS;
let lastFrameTime = 0;
let isTabVisible = true;

// Pause rendering when tab is not visible to save battery
document.addEventListener('visibilitychange', () => {
  isTabVisible = !document.hidden;
  if (isTabVisible) {
    // Resume clock to avoid huge delta jump
    clock.start();
  }
});


function tick(currentTime: number = 0): void {
  requestAnimationFrame(tick);
  
  // Pause rendering when tab is not visible
  if (!isTabVisible) return;
  
  // Frame rate limiting: skip frame if not enough time has passed
  const elapsed = currentTime - lastFrameTime;
  if (elapsed < frameInterval) return;
  
  // Update last frame time (with correction for drift)
  lastFrameTime = currentTime - (elapsed % frameInterval);
  
  stats.begin();
  
  const delta = clock.getDelta();
  
  // Update all animation mixers
  animationStates.forEach((state, root) => {
    state.mixer.update(delta);
  });
  
  // Update zoom progress
  if (isZooming) {
    zoomProgress = Math.min(1, zoomProgress + zoomSpeed);
  } else {
    zoomProgress = Math.max(0, zoomProgress - zoomSpeed);
  }
  
  // Update mouse-follow camera (look-at system to prevent tilt)
  // Calculate camera's local coordinate system
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  
  // Get the camera's orientation vectors from the original look direction
  cameraForward.subVectors(originalLookAtTarget, originalCameraPosition).normalize();
  cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();
  cameraUp.crossVectors(cameraRight, cameraForward).normalize();
  
  // Calculate target look-at position based on mouse
  const targetLookAt = originalLookAtTarget.clone();
  targetLookAt.add(cameraRight.clone().multiplyScalar(mouseX * mouseSensitivity));
  targetLookAt.add(cameraUp.clone().multiplyScalar(mouseY * mouseSensitivity));
  
  // Smoothly interpolate current look-at towards target
  currentLookAtTarget.lerp(targetLookAt, smoothing);
  
  // Add subtle parallax translation (camera moves slightly in direction of mouse)
  const parallaxOffset = new THREE.Vector3();
  parallaxOffset.add(cameraRight.clone().multiplyScalar(mouseX * parallaxAmount));
  parallaxOffset.add(cameraUp.clone().multiplyScalar(mouseY * parallaxAmount));
  
  // Apply zoom by moving camera towards look-at target
  const zoomedPosition = new THREE.Vector3();
  zoomedPosition.copy(originalCameraPosition);
  zoomedPosition.add(parallaxOffset); // Add parallax translation
  zoomedPosition.lerp(currentLookAtTarget, zoomProgress * zoomAmount); // Apply zoom
  
  camera.position.copy(zoomedPosition);
  camera.lookAt(currentLookAtTarget);
  
  renderer.render(scene, camera);
  
  stats.end();
}
tick();
