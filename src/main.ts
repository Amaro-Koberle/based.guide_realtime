import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SkeletonHelper } from 'three';
import Stats from 'stats.js';

/**
 * Animation System
 * 
 * Features:
 * - Loads animations from both embedded (in character GLB) and separate GLB files
 * - Creates one AnimationMixer per character root
 * - Supports multiple clips with smooth crossfading
 * - Debug helpers to list available animations
 * - Automatic fallback if specified clip not found
 * 
 * Usage:
 * - playAnimation(characterRoot, 'AnimationName', loop = true, crossfadeDuration = 0.3)
 * - stopAnimation(characterRoot, fadeOutDuration = 0.3)
 * - debugListClips(clips) - logs all available animations
 */

interface AnimationState {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentAction: THREE.AnimationAction | null;
}

const animationStates = new Map<THREE.Object3D, AnimationState>();

// Stats panel
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb
stats.dom.style.position = 'absolute';
stats.dom.style.top = '10px';
stats.dom.style.left = '10px';
document.body.appendChild(stats.dom);

// Debug helpers
let skeletonHelper: THREE.SkeletonHelper | null = null;
let currentCharacterRoot: THREE.Object3D | null = null;

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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(4, 3, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 1.5; // Prevent looking too far down

// Enable shadow rendering
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Hemisphere light for fake GI - will be updated with skydome color
const ambientFill = new THREE.HemisphereLight(
  0x87ceeb, // Default sky color (will be replaced with skydome emissive)
  0x3a2a1f, // Ground color - dark warm tone
  0.8       // Intensity
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
  console.log('🎬 Available animation clips:', clips.length);
  clips.forEach((clip, idx) => {
    console.log(`  [${idx}] "${clip.name}" - duration: ${clip.duration.toFixed(2)}s, tracks: ${clip.tracks.length}`);
    // Log track details for debugging
    const trackTypes = clip.tracks.reduce((acc, track) => {
      const type = track.constructor.name;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`    Track types:`, trackTypes);
  });
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

function getObjectDepth(obj: THREE.Object3D): number {
  let depth = 0;
  let current = obj;
  while (current.parent && current.parent !== scene) {
    depth++;
    current = current.parent;
  }
  return depth;
}

function createUI(clips: THREE.AnimationClip[]): void {
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: absolute;
    top: 80px;
    left: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 15px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
    min-width: 200px;
    max-width: 300px;
  `;
  
  const title = document.createElement('div');
  title.textContent = '🎬 Animation Controls';
  title.style.cssText = `
    font-weight: bold;
    margin-bottom: 10px;
    font-size: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
    padding-bottom: 5px;
  `;
  panel.appendChild(title);
  
  // Skeleton toggle
  const skeletonToggle = document.createElement('label');
  skeletonToggle.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
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
  panel.appendChild(skeletonToggle);
  
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
  panel.appendChild(fpsControl);
  
  // Debug button
  const debugBtn = document.createElement('button');
  debugBtn.textContent = 'Log Scene Hierarchy';
  debugBtn.style.cssText = `
    width: 100%;
    padding: 6px;
    margin-bottom: 12px;
    background: rgba(100, 100, 200, 0.2);
    color: white;
    border: 1px solid rgba(100, 100, 200, 0.4);
    border-radius: 4px;
    cursor: pointer;
    font-family: monospace;
    font-size: 10px;
  `;
  debugBtn.onclick = () => {
    if (currentCharacterRoot) {
      console.log('🌳 Character Scene Hierarchy:');
      currentCharacterRoot.traverse((obj: THREE.Object3D) => {
        const depth = getObjectDepth(obj);
        const prefix = '  '.repeat(depth);
        const type = obj.type || obj.constructor.name;
        console.log(`${prefix}${type}: "${obj.name}"`);
      });
    }
  };
  panel.appendChild(debugBtn);
  
  // Animation buttons
  if (clips.length > 0) {
    const animTitle = document.createElement('div');
    animTitle.textContent = 'Animations:';
    animTitle.style.cssText = `
      margin-top: 10px;
      margin-bottom: 8px;
      opacity: 0.7;
    `;
    panel.appendChild(animTitle);
    
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
        if (currentCharacterRoot) {
          playAnimation(currentCharacterRoot, clip.name, true);
          // Update all button states
          panel.querySelectorAll('button').forEach(b => {
            const isActive = (b as HTMLButtonElement).dataset.clipName === clip.name;
            b.style.background = isActive ? 'rgba(100, 200, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)';
            b.style.borderColor = isActive ? 'rgba(100, 200, 100, 0.6)' : 'rgba(255, 255, 255, 0.3)';
          });
        }
      };
      
      panel.appendChild(btn);
      
      // Highlight first playing animation
      const state = currentCharacterRoot && animationStates.get(currentCharacterRoot);
      if (state?.currentAction?.getClip().name === clip.name) {
        btn.style.background = 'rgba(100, 200, 100, 0.3)';
        btn.style.borderColor = 'rgba(100, 200, 100, 0.6)';
      }
    });
  } else {
    const noAnims = document.createElement('div');
    noAnims.textContent = 'No animations found';
    noAnims.style.opacity = '0.5';
    panel.appendChild(noAnims);
  }
  
  document.body.appendChild(panel);
}

async function loadAll(): Promise<void> {
  console.log('Loading environment...');
  const env = await gltf.loadAsync('/models/ENV_ApeEscapeOffice.glb');
  console.log('Environment loaded:', env);
  
  // Process environment: enable shadows and adjust lights
  env.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      const m = (obj as any).material;
      if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      
      // Extract skydome color for hemisphere light
      if (obj.name === 'Skydome' && m) {
        const skyColor = m.emissive || m.color;
        if (skyColor) {
          ambientFill.color.copy(skyColor);
        }
      }
    }
    
    // Adjust directional light intensity from GLB
    if (obj instanceof THREE.DirectionalLight) {
      obj.intensity = obj.intensity / 1000; // 1000x reduction
      obj.castShadow = true;
      // Configure shadow quality
      obj.shadow.mapSize.width = 4096;
      obj.shadow.mapSize.height = 4096;
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
  
  scene.add(env.scene);

  console.log('Loading character...');
  const char = await gltf.loadAsync('/models/CHAR_MrProBonobo.glb');
  
  // Enable shadows on character
  char.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      const m = (obj as any).material;
      if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    }
  });
  
  scene.add(char.scene);
  currentCharacterRoot = char.scene;
  
  // Debug: Inspect character structure
  console.log('🔍 Character structure analysis:');
  let hasSkeleton = false;
  let meshCount = 0;
  let skinnedMeshCount = 0;
  char.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.SkinnedMesh) {
      skinnedMeshCount++;
      hasSkeleton = true;
      console.log('  ✓ SkinnedMesh found:', obj.name, 'bones:', obj.skeleton?.bones.length);
    } else if (obj instanceof THREE.Mesh) {
      meshCount++;
      console.log('  - Regular Mesh:', obj.name);
    } else if (obj instanceof THREE.Bone) {
      console.log('  - Bone:', obj.name);
    }
  });
  console.log(`  Summary: ${skinnedMeshCount} skinned meshes, ${meshCount} regular meshes`);
  console.log(`  Has skeleton: ${hasSkeleton}`);
  
  if (!hasSkeleton && meshCount > 0) {
    console.error('❌ PROBLEM FOUND: Character has meshes but NO SKINNING DATA!');
    console.error('   The Blender export did not include vertex weights/skinning.');
    console.error('   Animation will play on bones but mesh will not deform.');
    console.error('');
    console.error('   FIX: Re-export from Blender with these settings:');
    console.error('   1. Make sure mesh has Armature modifier');
    console.error('   2. Vertex groups must be named after bones');
    console.error('   3. In GLB export: Enable "Skinning" under Armature section');
    console.error('   4. Apply modifiers if needed');
  }
  
  // Load and setup animations
  console.log('Loading character animations...');
  let allClips: THREE.AnimationClip[] = [];
  
  // First, check if character GLB has embedded animations
  if (char.animations && char.animations.length > 0) {
    console.log('Found embedded animations in character GLB');
    debugListClips(char.animations);
    allClips.push(...char.animations);
  }
  
  // Load separate animation GLB
  try {
    const animGltf = await gltf.loadAsync('/anims/ANIM_RT_MrProBonobo.glb');
    
    if (animGltf.animations && animGltf.animations.length > 0) {
      debugListClips(animGltf.animations);
      allClips.push(...animGltf.animations);
    }
  } catch (err) {
    console.warn('Could not load separate animation GLB:', err);
  }
  
  // Setup animation mixer if we have clips
  if (allClips.length > 0) {
    // Use the character scene as the mixer root
    const animState = setupAnimationMixer(char.scene, allClips);
    
    // Try to play the "Test_Baked" animation
    const testAction = playAnimation(char.scene, 'Test_Baked', true);
    
    if (!testAction) {
      // If Test_Baked not found, try common naming variations
      const variations = ['test_baked', 'TestBaked', 'Test Baked', 'Test-Baked', 'Test'];
      let foundAction = null;
      
      for (const name of variations) {
        foundAction = playAnimation(char.scene, name, true);
        if (foundAction) break;
      }
      
      if (!foundAction && allClips.length > 0) {
        console.warn('⚠️ "Test_Baked" not found. Playing first animation.');
        playAnimation(char.scene, allClips[0].name, true);
      }
    }
  } else {
    console.warn('⚠️ No animations found for character');
  }
  
  // Create UI controls after loading
  createUI(allClips);
  
  console.log('All models loaded successfully');
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

// Expose animation controls to window for debugging
(window as any).animDebug = {
  playAnimation,
  stopAnimation,
  debugListClips,
  getAnimationStates: () => animationStates,
  // Helper to get character root (assuming only one character for now)
  getCharacter: () => {
    const states = Array.from(animationStates.keys());
    return states.length > 0 ? states[0] : null;
  },
  // Quick play helper: window.animDebug.play('ClipName')
  play: (clipName: string, loop = true) => {
    const char = (window as any).animDebug.getCharacter();
    if (char) return playAnimation(char, clipName, loop);
    console.warn('No character found');
    return null;
  },
  // Quick list helper: window.animDebug.list()
  list: () => {
    const char = (window as any).animDebug.getCharacter();
    if (char) {
      const state = animationStates.get(char);
      if (state) {
        const clips = Array.from(state.actions.keys()).map((name, idx) => {
          const action = state.actions.get(name)!;
          return { name, duration: action.getClip().duration };
        });
        console.table(clips);
        return clips;
      }
    }
    console.warn('No character or animations found');
    return [];
  }
};

console.log('💡 Animation debug helpers available via window.animDebug');
console.log('   - animDebug.play("ClipName") - play an animation');
console.log('   - animDebug.list() - list all animations');

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
  animationStates.forEach(state => {
    state.mixer.update(delta);
  });
  
  controls.update();
  renderer.render(scene, camera);
  
  stats.end();
}
tick();
