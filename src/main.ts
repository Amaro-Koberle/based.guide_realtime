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
let shadowCameraHelper: THREE.CameraHelper | null = null;
let currentCharacterRoot: THREE.Object3D | null = null;

// Scene management
let sceneRoot: THREE.Group | null = null;
let characterRoot: THREE.Object3D | null = null;
let environmentRoot: THREE.Object3D | null = null;

// Light references for debug controls
let directionalLight: THREE.DirectionalLight | null = null;
let characterLightMultiplier = 40.0; // Character receives 40x more light than environment
let characterMaterials: THREE.Material[] = []; // Store character materials for light adjustment

// Network stats tracking
let totalBytesDownloaded = 0;
let glbBytesDownloaded = 0;
let textureBytesDownloaded = 0;

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
renderer.toneMappingExposure = 0.9; // Adjusted exposure for balanced lighting

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Will be updated when skydome loads

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(4, 3, 6);

// Adaptive camera system (mouse on desktop, gyro on mobile)
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

// Gyroscope system for mobile
let useGyro = false;
let gyroAlpha = 0;  // Z-axis (compass)
let gyroBeta = 0;   // X-axis (front-back tilt)
let gyroGamma = 0;  // Y-axis (left-right tilt)
let gyroCalibrationBeta = 0;  // Store calibration offset
let gyroCalibrationGamma = 0;

// Detect mobile device
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Initialize gyroscope on mobile
async function initGyro() {
  if (!isMobile) return;
  
  if (window.DeviceOrientationEvent) {
    // iOS 13+ requires permission
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          useGyro = true;
          window.addEventListener('deviceorientation', handleOrientation);
          console.log('📱 Gyroscope enabled');
        }
      } catch (error) {
        console.log('⚠️ Gyroscope permission denied');
      }
    } else {
      // Android and older iOS - no permission needed
      useGyro = true;
      window.addEventListener('deviceorientation', handleOrientation);
      console.log('📱 Gyroscope enabled');
    }
  }
}

function handleOrientation(event: DeviceOrientationEvent) {
  gyroAlpha = event.alpha || 0;
  gyroBeta = event.beta || 0;
  gyroGamma = event.gamma || 0;
}

function calibrateGyro() {
  gyroCalibrationBeta = gyroBeta;
  gyroCalibrationGamma = gyroGamma;
  console.log('🎯 Gyroscope calibrated');
}

// Apply character light multiplier to character materials
function applyCharacterLightMultiplier(multiplier: number) {
  characterLightMultiplier = multiplier;
  
  characterMaterials.forEach((material) => {
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
      // Store original emissive if not already stored
      if (!(material as any)._originalEmissiveIntensity) {
        (material as any)._originalEmissiveIntensity = material.emissiveIntensity || 0;
      }
      
      // Adjust emissive to simulate receiving more light
      // We use a subtle emissive boost rather than actually changing light intensity
      const boost = (multiplier - 1.0) * 0.15; // Scale down the effect
      material.emissiveIntensity = ((material as any)._originalEmissiveIntensity || 0) + boost;
      
      // Also slightly boost the material's overall color response to light
      if (!(material as any)._originalColor) {
        (material as any)._originalColor = material.color.clone();
      }
      
      // Brighten the base color slightly based on multiplier
      const brightnessBoost = 1.0 + (multiplier - 1.0) * 0.15;
      material.color.copy((material as any)._originalColor).multiplyScalar(brightnessBoost);
      
      material.needsUpdate = true;
    }
  });
}

// Track mouse movement (desktop only)
if (!isMobile) {
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
} else {
  // Track touch for zoom on mobile
  canvas.addEventListener('touchstart', () => {
    isZooming = true;
  });

  canvas.addEventListener('touchend', () => {
    isZooming = false;
  });

  canvas.addEventListener('touchcancel', () => {
    isZooming = false;
  });
}

// Enable shadow rendering
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Hemisphere light for fake GI - will be updated with skydome color
const ambientFill = new THREE.HemisphereLight(
  0x87ceeb, // Default sky color (will be replaced with skydome emissive)
  0xa3a3a3, // Ground color - light gray for better ceiling visibility
  1.2       // Intensity (increased for softer overall lighting)
);
scene.add(ambientFill);

// Additional ambient light to brighten dark areas (ceilings, under objects)
const ambientLight = new THREE.AmbientLight(0xffcfa8, 0.7); // Warm peach fill light
scene.add(ambientLight);

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

function toggleShadowCamera(visible: boolean): void {
  if (!directionalLight) {
    console.warn('No directional light loaded');
    return;
  }
  
  if (visible) {
    // Create shadow camera helper if it doesn't exist
    if (!shadowCameraHelper) {
      shadowCameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
      scene.add(shadowCameraHelper);
      console.log('✓ Shadow camera helper created');
    } else {
      shadowCameraHelper.visible = true;
      console.log('✓ Shadow camera helper shown');
    }
  } else {
    if (shadowCameraHelper) {
      shadowCameraHelper.visible = false;
      console.log('✓ Shadow camera helper hidden');
    }
  }
  
  // Update the helper if it exists
  if (shadowCameraHelper) {
    shadowCameraHelper.update();
  }
}


function createUI(_clips: THREE.AnimationClip[]): void {
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
  title.textContent = '🛠️ Dev Panel';
  
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
    max-height: 80vh;
    overflow-y: auto;
  `;
  panel.appendChild(content);
  
  // Toggle functionality
  let isExpanded = false;
  header.onclick = () => {
    isExpanded = !isExpanded;
    content.style.display = isExpanded ? 'block' : 'none';
    toggleIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
  };
  
  // Helper to create collapsible section
  function createSection(title: string, color: string) {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-bottom: 8px;
      background: ${color};
      border-radius: 4px;
      overflow: hidden;
    `;
    
    const sectionHeader = document.createElement('div');
    sectionHeader.style.cssText = `
      padding: 8px;
      cursor: pointer;
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: bold;
      font-size: 11px;
    `;
    
    const sectionTitle = document.createElement('span');
    sectionTitle.textContent = title;
    
    const sectionIcon = document.createElement('span');
    sectionIcon.textContent = '▼';
    sectionIcon.style.cssText = `
      font-size: 8px;
      transition: transform 0.2s;
    `;
    
    sectionHeader.appendChild(sectionTitle);
    sectionHeader.appendChild(sectionIcon);
    
    const sectionContent = document.createElement('div');
    sectionContent.style.cssText = `
      padding: 8px;
      display: block;
    `;
    
    let sectionExpanded = true;
    sectionHeader.onclick = () => {
      sectionExpanded = !sectionExpanded;
      sectionContent.style.display = sectionExpanded ? 'block' : 'none';
      sectionIcon.style.transform = sectionExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
    };
    
    section.appendChild(sectionHeader);
    section.appendChild(sectionContent);
    
    return { section, content: sectionContent };
  }
  
  // ========== PERFORMANCE SECTION ==========
  const perfSection = createSection('⚡ Performance', 'rgba(0, 100, 200, 0.2)');
  content.appendChild(perfSection.section);
  
  // FPS counter display (integrated stats.js)
  const fpsDisplay = document.createElement('div');
  fpsDisplay.style.cssText = `
    margin-bottom: 12px;
    background: rgba(0, 100, 200, 0.15);
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
  perfSection.content.appendChild(fpsDisplay);
  
  // FPS limiter control
  const fpsControl = document.createElement('div');
  fpsControl.style.cssText = `
    margin-bottom: 0;
  `;
  
  const fpsLabel = document.createElement('label');
  fpsLabel.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
  `;
  
  const fpsText = document.createElement('span');
  fpsText.textContent = `FPS Cap: ${targetFPS}`;
  fpsText.style.fontSize = '10px';
  fpsText.style.opacity = '0.9';
  
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
    console.log(`FPS cap changed to: ${targetFPS} (interval: ${frameInterval.toFixed(2)}ms)`);
  };
  
  fpsLabel.appendChild(fpsText);
  fpsLabel.appendChild(fpsSlider);
  fpsControl.appendChild(fpsLabel);
  perfSection.content.appendChild(fpsControl);
  
  // Performance statistics display
  const perfStatsContainer = document.createElement('div');
  perfStatsContainer.style.cssText = `
    margin-top: 12px;
    padding: 8px;
    background: rgba(0, 100, 200, 0.15);
    border-radius: 4px;
    border: 1px solid rgba(0, 150, 255, 0.3);
    font-size: 10px;
    line-height: 1.6;
  `;
  
  const perfStatsTitle = document.createElement('div');
  perfStatsTitle.textContent = '📊 Scene Stats';
  perfStatsTitle.style.cssText = `
    font-weight: bold;
    margin-bottom: 6px;
    opacity: 0.9;
  `;
  perfStatsContainer.appendChild(perfStatsTitle);
  
  // Create stats display elements
  const statsList = document.createElement('div');
  statsList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 3px;
  `;
  
  function createStatRow(label: string, id: string) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      opacity: 0.85;
    `;
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.id = id;
    valueEl.style.cssText = `
      font-weight: bold;
      color: #6cf;
    `;
    valueEl.textContent = '0';
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  }
  
  statsList.appendChild(createStatRow('Draw Calls/Frame:', 'stat-draw-calls'));
  statsList.appendChild(createStatRow('Triangles:', 'stat-triangles'));
  statsList.appendChild(createStatRow('Geometries:', 'stat-geometries'));
  statsList.appendChild(createStatRow('Textures:', 'stat-textures'));
  statsList.appendChild(createStatRow('Shader Programs:', 'stat-programs'));
  statsList.appendChild(createStatRow('Objects:', 'stat-objects'));
  statsList.appendChild(createStatRow('Lights:', 'stat-lights'));
  
  // Add separator for network stats
  const separator = document.createElement('div');
  separator.style.cssText = `
    margin: 6px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  `;
  statsList.appendChild(separator);
  
  const networkTitle = document.createElement('div');
  networkTitle.textContent = '📦 Network Load';
  networkTitle.style.cssText = `
    font-weight: bold;
    margin-bottom: 4px;
    opacity: 0.9;
    font-size: 9px;
  `;
  statsList.appendChild(networkTitle);
  
  statsList.appendChild(createStatRow('Total Downloaded:', 'stat-download-size'));
  statsList.appendChild(createStatRow('GLB Files:', 'stat-glb-size'));
  statsList.appendChild(createStatRow('Textures:', 'stat-texture-size'));
  
  const memoryLabel = document.createElement('div');
  memoryLabel.style.cssText = `
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 9px;
    opacity: 0.7;
  `;
  memoryLabel.textContent = 'Stats update every frame';
  statsList.appendChild(memoryLabel);
  
  perfStatsContainer.appendChild(statsList);
  perfSection.content.appendChild(perfStatsContainer);
  
  // ========== LIGHTING SECTION ==========
  const lightSection = createSection('💡 Lighting', 'rgba(80, 60, 40, 0.3)');
  content.appendChild(lightSection.section);
  
  // Helper function to create a slider control
  function createSlider(label: string, min: number, max: number, value: number, step: number, onChange: (value: number) => void) {
    const container = document.createElement('div');
    container.style.cssText = `
      margin-bottom: 8px;
    `;
    
    const labelEl = document.createElement('label');
    labelEl.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;
    
    const textEl = document.createElement('span');
    textEl.textContent = `${label}: ${value.toFixed(2)}`;
    textEl.style.cssText = `
      font-size: 10px;
      opacity: 0.9;
    `;
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min.toString();
    slider.max = max.toString();
    slider.value = value.toString();
    slider.step = step.toString();
    slider.style.cssText = `
      width: 100%;
      cursor: pointer;
    `;
    
    slider.oninput = (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      textEl.textContent = `${label}: ${val.toFixed(2)}`;
      onChange(val);
    };
    
    labelEl.appendChild(textEl);
    labelEl.appendChild(slider);
    container.appendChild(labelEl);
    return container;
  }
  
  // Helper function to create a color picker
  function createColorPicker(label: string, color: THREE.Color, onChange: (color: THREE.Color) => void) {
    const container = document.createElement('div');
    container.style.cssText = `
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      font-size: 10px;
      opacity: 0.9;
      flex: 1;
    `;
    
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#' + color.getHexString();
    colorInput.style.cssText = `
      width: 40px;
      height: 24px;
      cursor: pointer;
      border: none;
      border-radius: 4px;
    `;
    
    colorInput.oninput = (e) => {
      const hex = (e.target as HTMLInputElement).value;
      color.setStyle(hex);
      onChange(color);
    };
    
    container.appendChild(labelEl);
    container.appendChild(colorInput);
    return container;
  }
  
  // Helper function to create a checkbox
  function createCheckbox(label: string, checked: boolean, onChange: (checked: boolean) => void) {
    const container = document.createElement('label');
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      cursor: pointer;
    `;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.style.cursor = 'pointer';
    checkbox.onchange = (e) => onChange((e.target as HTMLInputElement).checked);
    
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.fontSize = '10px';
    
    container.appendChild(checkbox);
    container.appendChild(labelEl);
    return container;
  }
  
  // Directional Light Intensity
  lightSection.content.appendChild(createSlider('Direct Light', 0, 100, 
    directionalLight?.intensity || 25, 0.5, (val) => {
      if (directionalLight) directionalLight.intensity = val;
    }
  ));
  
  // Directional Light Color
  if (directionalLight) {
    lightSection.content.appendChild(createColorPicker('Dir Color', directionalLight.color, (color) => {
      if (directionalLight) directionalLight.color.copy(color);
    }));
  }
  
  // Character Light Multiplier
  lightSection.content.appendChild(createSlider('Char Light Mult', 0.5, 100, 
    characterLightMultiplier, 0.5, (val) => {
      applyCharacterLightMultiplier(val);
    }
  ));
  
  // Directional Light (sun)
  const dirLightLabel = document.createElement('div');
  dirLightLabel.textContent = '☀️ Sun Light';
  dirLightLabel.style.cssText = `
    font-weight: bold;
    font-size: 10px;
    margin-top: 4px;
    margin-bottom: 4px;
    opacity: 0.7;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 8px;
  `;
  lightSection.content.appendChild(dirLightLabel);
  
  // Hemisphere Light Intensity
  const hemiLightLabel = document.createElement('div');
  hemiLightLabel.textContent = '🌍 Hemisphere (Sky/Ground)';
  hemiLightLabel.style.cssText = `
    font-weight: bold;
    font-size: 10px;
    margin-top: 8px;
    margin-bottom: 4px;
    opacity: 0.7;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 8px;
  `;
  lightSection.content.appendChild(hemiLightLabel);
  
  lightSection.content.appendChild(createSlider('Hemisphere', 0, 5, 
    ambientFill.intensity, 0.1, (val) => {
      ambientFill.intensity = val;
    }
  ));
  
  // Hemisphere Sky Color
  lightSection.content.appendChild(createColorPicker('Sky Color', ambientFill.color, (color) => {
    ambientFill.color.copy(color);
  }));
  
  // Hemisphere Ground Color
  lightSection.content.appendChild(createColorPicker('Ground Color', ambientFill.groundColor, (color) => {
    ambientFill.groundColor.copy(color);
  }));
  
  // Ambient Light (fills all shadows equally)
  const ambientLightLabel = document.createElement('div');
  ambientLightLabel.textContent = '💡 Ambient (Fill Light)';
  ambientLightLabel.style.cssText = `
    font-weight: bold;
    font-size: 10px;
    margin-top: 8px;
    margin-bottom: 4px;
    opacity: 0.7;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 8px;
  `;
  lightSection.content.appendChild(ambientLightLabel);
  
  lightSection.content.appendChild(createSlider('Fill Light', 0, 3, 
    ambientLight.intensity, 0.1, (val) => {
      ambientLight.intensity = val;
    }
  ));
  
  lightSection.content.appendChild(createColorPicker('Fill Color', ambientLight.color, (color) => {
    ambientLight.color.copy(color);
  }));
  
  // Rendering
  const renderLabel = document.createElement('div');
  renderLabel.textContent = '🎨 Rendering';
  renderLabel.style.cssText = `
    font-weight: bold;
    font-size: 10px;
    margin-top: 8px;
    margin-bottom: 4px;
    opacity: 0.7;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 8px;
  `;
  lightSection.content.appendChild(renderLabel);
  
  // Tone Mapping Exposure
  lightSection.content.appendChild(createSlider('Exposure', 0.1, 5, 
    renderer.toneMappingExposure, 0.1, (val) => {
      renderer.toneMappingExposure = val;
    }
  ));
  
  // Shadow controls
  const shadowLabel = document.createElement('div');
  shadowLabel.textContent = '🌑 Shadows';
  shadowLabel.style.cssText = `
    font-weight: bold;
    font-size: 10px;
    margin-top: 8px;
    margin-bottom: 4px;
    opacity: 0.7;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 8px;
  `;
  lightSection.content.appendChild(shadowLabel);
  
  lightSection.content.appendChild(createCheckbox('Enable Shadows', renderer.shadowMap.enabled, (checked) => {
    renderer.shadowMap.enabled = checked;
    if (directionalLight) directionalLight.castShadow = checked;
  }));
  
  // Show shadow camera helper
  lightSection.content.appendChild(createCheckbox('Show Shadow Camera', false, (checked) => {
    toggleShadowCamera(checked);
  }));
  
  // Shadow bias (fixes shadow acne)
  if (directionalLight) {
    lightSection.content.appendChild(createSlider('Shadow Bias', -0.01, 0.01, 
      directionalLight.shadow.bias, 0.0001, (val) => {
        if (directionalLight) directionalLight.shadow.bias = val;
      }
    ));
    
    // Shadow darkness/opacity
    lightSection.content.appendChild(createSlider('Shadow Opacity', 0, 1, 
      0.3, 0.05, (val) => {
        // This is a bit hacky but works - we'll adjust all materials' shadow darkness
        // by modifying the shadow camera's intensity indirectly through materials
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.receiveShadow) {
            if (obj.material instanceof THREE.Material) {
              // Store original color if not already stored
              if (!(obj.material as any)._originalColor) {
                (obj.material as any)._originalColor = (obj.material as any).color?.clone();
              }
            }
          }
        });
        // Instead, let's adjust the ambient light to simulate shadow lightening
        const shadowFillAmount = 1 - val; // Invert: 0 = dark shadows, 1 = light shadows
        ambientLight.intensity = Math.max(0.3, shadowFillAmount * 1.5);
      }
    ));
    
    // Shadow Camera Size Controls
    lightSection.content.appendChild(createSlider('Shadow Cam Width', 1, 50, 
      10, 0.5, (val) => {
        if (directionalLight) {
          directionalLight.shadow.camera.left = -val;
          directionalLight.shadow.camera.right = val;
          directionalLight.shadow.camera.updateProjectionMatrix();
          if (shadowCameraHelper) shadowCameraHelper.update();
        }
      }
    ));
    
    lightSection.content.appendChild(createSlider('Shadow Cam Height', 1, 50, 
      16, 0.5, (val) => {
        if (directionalLight) {
          directionalLight.shadow.camera.top = val;
          directionalLight.shadow.camera.bottom = -val;
          directionalLight.shadow.camera.updateProjectionMatrix();
          if (shadowCameraHelper) shadowCameraHelper.update();
        }
      }
    ));
    
    lightSection.content.appendChild(createSlider('Shadow Cam Depth', 1, 50, 
      9, 0.5, (val) => {
        if (directionalLight) {
          directionalLight.shadow.camera.far = val;
          directionalLight.shadow.camera.updateProjectionMatrix();
          if (shadowCameraHelper) shadowCameraHelper.update();
        }
      }
    ));
    
    // Shadow map resolution (power of 2 only)
    // Create custom slider that only allows powers of 2
    const resolutionContainer = document.createElement('div');
    resolutionContainer.style.cssText = `margin-bottom: 8px;`;
    
    const resolutionLabel = document.createElement('label');
    resolutionLabel.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;
    
    const resolutionText = document.createElement('span');
    resolutionText.textContent = `Shadow Resolution: 4096.00`;
    resolutionText.style.cssText = `font-size: 10px; opacity: 0.9;`;
    
    const resolutionSlider = document.createElement('input');
    resolutionSlider.type = 'range';
    resolutionSlider.min = '8'; // 2^8 = 256
    resolutionSlider.max = '14'; // 2^14 = 16384
    resolutionSlider.value = '12'; // 2^12 = 4096
    resolutionSlider.step = '1';
    resolutionSlider.style.cssText = `width: 100%; cursor: pointer;`;
    
    resolutionSlider.oninput = (e) => {
      const power = parseInt((e.target as HTMLInputElement).value);
      const val = Math.pow(2, power);
      resolutionText.textContent = `Shadow Resolution: ${val.toFixed(2)}`;
      if (directionalLight) {
        directionalLight.shadow.mapSize.width = val;
        directionalLight.shadow.mapSize.height = val;
        // Need to dispose and recreate shadow map for resolution change
        if (directionalLight.shadow.map) {
          directionalLight.shadow.map.dispose();
          directionalLight.shadow.map = null;
        }
      }
    };
    
    resolutionLabel.appendChild(resolutionText);
    resolutionLabel.appendChild(resolutionSlider);
    resolutionContainer.appendChild(resolutionLabel);
    lightSection.content.appendChild(resolutionContainer);
  }
  
  // Restore Defaults button
  const restoreButton = document.createElement('button');
  restoreButton.textContent = '🔄 Restore Lighting Defaults';
  restoreButton.style.cssText = `
    width: 100%;
    padding: 10px;
    margin-top: 12px;
    background: rgba(100, 150, 255, 0.3);
    border: 1px solid rgba(100, 150, 255, 0.5);
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-family: monospace;
    font-size: 12px;
    font-weight: bold;
  `;
  restoreButton.onclick = () => {
    // Restore all lighting defaults
    if (directionalLight) {
      directionalLight.intensity = 25;
      directionalLight.color.setHex(0xffb338); // Warm orange light
    }
    ambientFill.intensity = 1.2;
    ambientFill.color.setHex(0x87ceeb);
    ambientFill.groundColor.setHex(0xa3a3a3);
    ambientLight.intensity = 0.7;
    ambientLight.color.setHex(0xffcfa8);
    renderer.toneMappingExposure = 0.9;
    characterLightMultiplier = 40;
    applyCharacterLightMultiplier(40);
    
    // Restore shadow defaults
    if (directionalLight) {
      directionalLight.castShadow = true;
      directionalLight.shadow.camera.left = -9;
      directionalLight.shadow.camera.right = 9;
      directionalLight.shadow.camera.top = 8;
      directionalLight.shadow.camera.bottom = -8;
      directionalLight.shadow.camera.far = 16;
      directionalLight.shadow.camera.updateProjectionMatrix();
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.bias = -0.0001;
      directionalLight.shadow.normalBias = 0.02;
      if (shadowCameraHelper) shadowCameraHelper.update();
      if (directionalLight.shadow.map) {
        directionalLight.shadow.map.dispose();
        directionalLight.shadow.map = null;
      }
    }
    renderer.shadowMap.enabled = true;
    toggleShadowCamera(false); // Hide helper by default
    
    // Visual feedback
    restoreButton.textContent = '✓ Restored!';
    restoreButton.style.background = 'rgba(100, 255, 100, 0.3)';
    restoreButton.style.borderColor = 'rgba(100, 255, 100, 0.5)';
    setTimeout(() => {
      restoreButton.textContent = '🔄 Restore Lighting Defaults';
      restoreButton.style.background = 'rgba(100, 150, 255, 0.3)';
      restoreButton.style.borderColor = 'rgba(100, 150, 255, 0.5)';
    }, 1500);
    
    console.log('✓ All lighting defaults restored (refresh page to update UI sliders)');
  };
  lightSection.content.appendChild(restoreButton);
  
  // ========== ANIMATION SECTION ==========
  const animSection = createSection('🎬 Animation', 'rgba(120, 60, 120, 0.3)');
  content.appendChild(animSection.section);
  
  // Skeleton toggle
  animSection.content.appendChild(createCheckbox('Show Skeleton', false, (checked) => {
    toggleSkeleton(checked);
  }));
  
  // Gyro controls (mobile only)
  if (isMobile) {
    const gyroButton = document.createElement('button');
    gyroButton.textContent = useGyro ? '📱 Gyro Active' : '📱 Enable Gyro';
    gyroButton.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-top: 8px;
      background: ${useGyro ? 'rgba(100, 255, 100, 0.3)' : 'rgba(100, 150, 255, 0.3)'};
      border: 1px solid ${useGyro ? 'rgba(100, 255, 100, 0.5)' : 'rgba(100, 150, 255, 0.5)'};
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-family: monospace;
      font-size: 11px;
    `;
    
    gyroButton.onclick = async () => {
      if (!useGyro) {
        // Request permission on first click
        await initGyro();
        if (useGyro) {
          gyroButton.textContent = '📱 Gyro Active';
          gyroButton.style.background = 'rgba(100, 255, 100, 0.3)';
          gyroButton.style.borderColor = 'rgba(100, 255, 100, 0.5)';
          calibrateGyro();
        } else {
          gyroButton.textContent = '❌ Permission Denied';
          gyroButton.style.background = 'rgba(255, 100, 100, 0.3)';
          gyroButton.style.borderColor = 'rgba(255, 100, 100, 0.5)';
        }
      } else {
        // Recalibrate
        calibrateGyro();
        gyroButton.textContent = '✓ Calibrated!';
        setTimeout(() => {
          gyroButton.textContent = '📱 Gyro Active';
        }, 1500);
      }
    };
    
    animSection.content.appendChild(gyroButton);
  }
  
  document.body.appendChild(panel);
}

// Helper to load GLB with size tracking
async function loadGLBWithStats(url: string): Promise<any> {
  const response = await fetch(url);
  const contentLength = parseInt(response.headers.get('content-length') || '0');
  const blob = await response.blob();
  const actualSize = blob.size;
  
  glbBytesDownloaded += actualSize;
  totalBytesDownloaded += actualSize;
  
  const objectUrl = URL.createObjectURL(blob);
  const gltfData = await gltf.loadAsync(objectUrl);
  URL.revokeObjectURL(objectUrl);
  
  return gltfData;
}

async function loadAll(): Promise<void> {
  console.log('🎬 Loading scene components...');
  
  // Load environment from ENV_MASTER
  console.log('  🏢 Loading environment GLB...');
  const envGltf = await loadGLBWithStats('/ENV_ApeEscapeOffice.glb');
  console.log(`    ✓ Environment loaded (${envGltf.scenes[0].children.length} root objects)`);
  
  // Load character from CHAR_MASTER
  console.log('  🦍 Loading character GLB...');
  const charGltf = await loadGLBWithStats('/CHAR_MrProBonobo.glb');
  console.log(`    ✓ Character loaded (${charGltf.animations.length} animations)`);
  
  // Load scene (camera + animations) from RT_ANIM
  console.log('  📷 Loading scene GLB (camera + animations)...');
  const sceneGltf = await loadGLBWithStats('/RT_SCENE_ApeEscape.glb');
  console.log(`    ✓ Scene loaded (${sceneGltf.animations.length} animation clips)`);
  
  // Add environment to scene
  sceneRoot = envGltf.scene;
  if (sceneRoot) {
    scene.add(sceneRoot);
    console.log(`  → Environment root at: (${sceneRoot.position.x.toFixed(3)}, ${sceneRoot.position.y.toFixed(3)}, ${sceneRoot.position.z.toFixed(3)})`);
  }
  
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
  
  // TEMPORARY FIX: Manual vertical offset to match Blender visual appearance
  // Character appears ~5cm higher in Three.js than Blender despite identical Y=0 position (cause unknown)
  charGltf.scene.position.y -= 0.05;
  
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
      
      // Store character materials for light intensity adjustment
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          characterMaterials.push(...obj.material);
        } else {
          characterMaterials.push(obj.material);
        }
      }
      
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
    const rootTrack = clip.tracks.find((track: THREE.KeyframeTrack) => track.name === 'ROOT.position');
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
        
        // Handle double-sided materials (objects with "DOUBLE" in name)
        if (obj.name.includes('DOUBLE')) {
          if (Array.isArray(m)) {
            m.forEach((mat: THREE.Material) => {
              mat.side = THREE.DoubleSide;
            });
          } else if (m) {
            m.side = THREE.DoubleSide;
          }
          console.log(`  ✓ Double-sided material enabled for: ${obj.name}`);
        }
        
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
        directionalLight = obj; // Store reference for debug controls
        obj.intensity = 25; // Set to default value of 25
        obj.color.setHex(0xffb338); // Default warm light color
        obj.castShadow = true;
        
        // Adaptive shadow quality based on device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const shadowMapSize = isMobile ? 1024 : 2048;
        
        obj.shadow.mapSize.width = shadowMapSize;
        obj.shadow.mapSize.height = shadowMapSize;
        obj.shadow.camera.near = 0.1;
        obj.shadow.camera.far = 16;
        obj.shadow.camera.left = -9;
        obj.shadow.camera.right = 9;
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
  
  // Apply initial character light multiplier
  console.log(`\n💡 Applying character light multiplier: ${characterLightMultiplier}x`);
  applyCharacterLightMultiplier(characterLightMultiplier);
  
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
  
  // Update camera (adaptive: gyro on mobile, mouse on desktop)
  // Calculate camera's local coordinate system
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  
  // Get the camera's orientation vectors from the original look direction
  cameraForward.subVectors(originalLookAtTarget, originalCameraPosition).normalize();
  cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();
  cameraUp.crossVectors(cameraRight, cameraForward).normalize();
  
  // Get input values (either from gyro or mouse)
  let inputX = mouseX;
  let inputY = mouseY;
  
  if (useGyro) {
    // Use device tilt (gamma for left/right, beta for up/down)
    // Apply calibration offset and normalize to -1 to 1 range
    const tiltX = THREE.MathUtils.clamp((gyroGamma - gyroCalibrationGamma) / 30, -1, 1);  // ±30° range
    const tiltY = THREE.MathUtils.clamp((gyroBeta - gyroCalibrationBeta) / 30, -1, 1);
    
    inputX = tiltX;
    inputY = -tiltY; // Invert Y for natural feel
  }
  
  // Calculate target look-at position based on input
  const targetLookAt = originalLookAtTarget.clone();
  targetLookAt.add(cameraRight.clone().multiplyScalar(inputX * mouseSensitivity));
  targetLookAt.add(cameraUp.clone().multiplyScalar(inputY * mouseSensitivity));
  
  // Smoothly interpolate current look-at towards target
  currentLookAtTarget.lerp(targetLookAt, smoothing);
  
  // Add subtle parallax translation (camera moves slightly in direction of input)
  const parallaxOffset = new THREE.Vector3();
  parallaxOffset.add(cameraRight.clone().multiplyScalar(inputX * parallaxAmount));
  parallaxOffset.add(cameraUp.clone().multiplyScalar(inputY * parallaxAmount));
  
  // Apply zoom by moving camera towards look-at target
  const zoomedPosition = new THREE.Vector3();
  zoomedPosition.copy(originalCameraPosition);
  zoomedPosition.add(parallaxOffset); // Add parallax translation
  zoomedPosition.lerp(currentLookAtTarget, zoomProgress * zoomAmount); // Apply zoom
  
  camera.position.copy(zoomedPosition);
  camera.lookAt(currentLookAtTarget);
  
  renderer.render(scene, camera);
  
  // Update performance stats display
  const info = renderer.info;
  const drawCallsEl = document.getElementById('stat-draw-calls');
  const trianglesEl = document.getElementById('stat-triangles');
  const geometriesEl = document.getElementById('stat-geometries');
  const texturesEl = document.getElementById('stat-textures');
  const programsEl = document.getElementById('stat-programs');
  const objectsEl = document.getElementById('stat-objects');
  const lightsEl = document.getElementById('stat-lights');
  
  if (drawCallsEl) drawCallsEl.textContent = info.render.calls.toString();
  if (trianglesEl) trianglesEl.textContent = info.render.triangles.toLocaleString();
  if (geometriesEl) geometriesEl.textContent = info.memory.geometries.toString();
  if (texturesEl) texturesEl.textContent = info.memory.textures.toString();
  if (programsEl) programsEl.textContent = info.programs?.length.toString() || '0';
  
  // Count objects and lights in scene
  let objectCount = 0;
  let lightCount = 0;
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) {
      objectCount++;
    }
    if (obj instanceof THREE.Light) {
      lightCount++;
    }
  });
  
  if (objectsEl) objectsEl.textContent = objectCount.toString();
  if (lightsEl) lightsEl.textContent = lightCount.toString();
  
  // Update network stats
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  // Calculate texture memory (estimate based on renderer info)
  const textureCount = info.memory.textures;
  // Rough estimate: assume average 2MB per texture (highly variable in reality)
  const estimatedTextureSize = textureCount * 2 * 1024 * 1024;
  textureBytesDownloaded = estimatedTextureSize;
  
  const downloadSizeEl = document.getElementById('stat-download-size');
  const glbSizeEl = document.getElementById('stat-glb-size');
  const textureSizeEl = document.getElementById('stat-texture-size');
  
  if (downloadSizeEl) downloadSizeEl.textContent = formatBytes(totalBytesDownloaded + textureBytesDownloaded);
  if (glbSizeEl) glbSizeEl.textContent = formatBytes(glbBytesDownloaded);
  if (textureSizeEl) textureSizeEl.textContent = formatBytes(estimatedTextureSize) + ' (est)';
  
  stats.end();
}
tick();
