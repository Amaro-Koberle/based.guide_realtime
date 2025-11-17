import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { SkeletonHelper } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
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
 * - Validates that animations contain bone transforms (not just morph targets)
 * 
 * Usage:
 * - playAnimation(characterRoot, 'AnimationName', loop = true, crossfadeDuration = 0.3)
 * - stopAnimation(characterRoot, fadeOutDuration = 0.3)
 * - debugListClips(clips) - logs all available animations
 * 
 * Common Issues:
 * - If character stays in T-pose: Animation GLB may only contain shape key/morph target data
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

// Character management
let characterTemplate: any = null; // Store the loaded GLTF for cloning
let characterInstances: THREE.Object3D[] = [];
let environmentScene: THREE.Group | null = null;
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
  if (!environmentScene) {
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
  environmentScene.traverse((obj: THREE.Object3D) => {
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
  if (!environmentScene) {
    console.warn('No environment loaded');
    return;
  }
  
  let meshCount = 0;
  environmentScene.traverse((obj: THREE.Object3D) => {
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
    if (environmentScene) {
      environmentScene.visible = (e.target as HTMLInputElement).checked;
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
      
      // Adaptive shadow quality based on device
      // Mobile devices get lower resolution shadows for better performance
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const shadowMapSize = isMobile ? 1024 : 2048; // Reduced from 4096!
      
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
      
      console.log(`Shadow map size set to ${shadowMapSize}×${shadowMapSize} (${isMobile ? 'mobile' : 'desktop'})`);
    }
  });
  
  scene.add(env.scene);
  environmentScene = env.scene;

  console.log('Loading character...');
  const char = await gltf.loadAsync('/models/CHAR_MrProBonobo.glb');
  
  // Store as template for cloning
  characterTemplate = char;
  
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
  characterInstances.push(char.scene);
  
  // Debug: Inspect character structure
  console.log('🔍 Character structure analysis:');
  let hasSkeleton = false;
  let meshCount = 0;
  let skinnedMeshCount = 0;
  let totalBones = 0;
  
  char.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.SkinnedMesh) {
      skinnedMeshCount++;
      hasSkeleton = true;
      totalBones = obj.skeleton?.bones.length || 0;
      console.log('  ✓ SkinnedMesh found:', obj.name);
      console.log('    - Bones:', totalBones);
      console.log('    - Vertices:', obj.geometry.attributes.position.count);
      console.log('    - Bone Texture:', !!obj.skeleton.boneTexture);
    } else if (obj instanceof THREE.Mesh) {
      meshCount++;
    }
  });
  
  console.log(`  Summary: ${skinnedMeshCount} skinned mesh(es), ${meshCount} regular mesh(es), ${totalBones} bones`);
  console.log(`  Has skeleton: ${hasSkeleton}`);
  
  
  
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
    
    console.log('📦 Animation GLB loaded, analyzing structure...');
    console.log('  - Has scene:', !!animGltf.scene);
    console.log('  - Scene children:', animGltf.scene?.children.length || 0);
    console.log('  - Animations found:', animGltf.animations?.length || 0);
    
    // Log the scene hierarchy to see what was exported
    if (animGltf.scene) {
      console.log('  - Scene hierarchy:');
      animGltf.scene.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Bone) {
          console.log(`    └─ Bone: ${obj.name}`);
          return; // Only log first few bones
        } else if (obj !== animGltf.scene) {
          console.log(`    └─ ${obj.type}: ${obj.name}`);
        }
      });
    }
    
    if (animGltf.animations && animGltf.animations.length > 0) {
      debugListClips(animGltf.animations);
      allClips.push(...animGltf.animations);
    } else {
      console.warn('⚠️ Animation GLB loaded but contains NO animations!');
    }
  } catch (err) {
    console.error('❌ Could not load separate animation GLB:', err);
  }
  
  // Store animations in template for cloning
  characterTemplate.animations = allClips;
  
  // Setup animation mixer if we have clips
  if (allClips.length > 0) {
    console.log(`\n🎬 Setting up animations...`);
    console.log(`Available clips:`, allClips.map(c => c.name));
    
    // Check if animations are skeletal or morph targets
    const hasBoneAnimations = allClips.some(clip => 
      clip.tracks.some(track => 
        track.name.includes('.position') || 
        track.name.includes('.quaternion') || 
        track.name.includes('.scale')
      )
    );
    
    if (!hasBoneAnimations) {
      console.error('\n❌ CRITICAL: Animations contain NO BONE TRANSFORMS!');
      console.error('   Character has skeleton with 403 bones, but animations only affect morph targets.');
      console.error('   The character will remain in A/T-pose - bones are not animated.');
      console.error('');
      console.error('   🔧 BLENDER EXPORT FIX:');
      console.error('   1. In Blender, select the Armature (not the mesh)');
      console.error('   2. Go to Pose Mode (Ctrl+Tab or mode dropdown)');
      console.error('   3. Check if your animation has keyframes on bones (orange/yellow frames in timeline)');
      console.error('   4. When exporting GLB:');
      console.error('      - Animation tab: Enable "Export Deformation Bones Only" or "Export All Bones"');
      console.error('      - Make sure "Bake Animation" is enabled');
      console.error('      - If using NLA strips, enable "NLA Strips" or "Export All Actions"');
      console.error('   5. Re-export and replace the ANIM_RT_MrProBonobo.glb file');
      console.error('');
      console.error('   Current animation tracks:', allClips[0].tracks.map(t => t.name).join(', '));
      console.error('   Expected tracks like: "DEF_SPINE_01.quaternion", "DEF_ARM_01L.position", etc.');
      console.error('');
    }
    
    // Use the character scene as the mixer root
    const animState = setupAnimationMixer(char.scene, allClips);
    console.log(`✓ Animation mixer created with ${allClips.length} clips`);
    
    // Auto-play the Sitting_Idle animation by default
    const defaultAnim = 'Sitting_Idle';
    console.log(`\n🎯 Attempting to play default animation: "${defaultAnim}"`);
    const action = playAnimation(char.scene, defaultAnim, true);
    
    if (action) {
      console.log(`✅ Successfully started "${defaultAnim}" animation`);
      console.log(`   - Duration: ${action.getClip().duration}s`);
      console.log(`   - Loop: ${action.loop === THREE.LoopRepeat}`);
      console.log(`   - Enabled: ${action.enabled}`);
      console.log(`   - Paused: ${action.paused}`);
      console.log(`   - Time: ${action.time}`);
    } else {
      // Fallback to first animation if Sitting_Idle not found
      console.warn(`⚠️ Animation "${defaultAnim}" not found!`);
      console.log(`Available animations:`, allClips.map(c => c.name).join(', '));
      console.log(`\n🔄 Falling back to first animation: "${allClips[0].name}"`);
      const fallbackAction = playAnimation(char.scene, allClips[0].name, true);
      if (fallbackAction) {
        console.log(`✅ Fallback animation playing`);
      } else {
        console.error(`❌ Failed to play fallback animation!`);
      }
    }
  } else {
    console.error('❌ No animations found for character!');
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
  
  controls.update();
  
  renderer.render(scene, camera);
  
  stats.end();
}
tick();
