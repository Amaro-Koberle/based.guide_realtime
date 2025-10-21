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

// Character management
let characterTemplate: any = null; // Store the loaded GLTF for cloning
let characterInstances: THREE.Object3D[] = [];
let currentCharacterCount = 1;

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

function updateCharacterCount(count: number): void {
  if (!characterTemplate) {
    console.warn('Character template not loaded yet');
    return;
  }
  
  const diff = count - currentCharacterCount;
  
  if (diff > 0) {
    // Add characters
    for (let i = 0; i < diff; i++) {
      addCharacter();
    }
  } else if (diff < 0) {
    // Remove characters (but keep at least one)
    for (let i = 0; i < Math.abs(diff); i++) {
      removeCharacter();
    }
  }
  
  currentCharacterCount = count;
  
  // Log performance summary
  console.log(`\n📊 Performance Summary:`);
  console.log(`  Characters: ${characterInstances.length}`);
  console.log(`  Expected Draw Calls: ~${characterInstances.length} (1 per character)`);
  console.log(`  Total Bones: ${characterInstances.length} × 205 = ${characterInstances.length * 205}`);
  console.log(`  Animation Mixers: ${animationStates.size}`);
}

function addCharacter(): void {
  if (!characterTemplate) return;
  
  // Clone the scene
  const newChar = SkeletonUtils.clone(characterTemplate.scene);
  
  // Enable shadows on cloned character
  newChar.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  
  // Position characters in a row along X axis (side by side)
  const positionX = (characterInstances.length - 10) * 0.8; // Center around origin
  newChar.position.set(positionX, 0, 0);
  
  scene.add(newChar);
  characterInstances.push(newChar);
  
  // Setup animation for this character
  if (characterTemplate.animations && characterTemplate.animations.length > 0) {
    setupAnimationMixer(newChar, characterTemplate.animations);
    playAnimation(newChar, characterTemplate.animations[0].name, true, 0);
  }
  
  console.log(`✓ Added character #${characterInstances.length} at x=${positionX}`);
}

function removeCharacter(): void {
  if (characterInstances.length <= 1) {
    console.warn('⚠️ Cannot remove last character');
    return;
  }
  
  const char = characterInstances.pop();
  if (char) {
    // Clean up animation state
    const state = animationStates.get(char);
    if (state) {
      state.mixer.stopAllAction();
      animationStates.delete(char);
    }
    
    // Remove from scene
    scene.remove(char);
    
    // Dispose of resources
    char.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    
    console.log(`✓ Removed character, ${characterInstances.length} remaining`);
  }
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
  
  // Character count control
  const charControl = document.createElement('div');
  charControl.style.cssText = `
    margin-bottom: 12px;
    padding: 8px;
    background: rgba(50, 100, 50, 0.3);
    border-radius: 4px;
    border: 1px solid rgba(100, 200, 100, 0.3);
  `;
  
  const charLabel = document.createElement('label');
  charLabel.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
  `;
  
  const charText = document.createElement('span');
  charText.textContent = `Characters: ${currentCharacterCount}`;
  charText.style.fontSize = '11px';
  charText.style.opacity = '0.8';
  
  const drawCallsText = document.createElement('span');
  drawCallsText.id = 'drawCallsText';
  drawCallsText.textContent = `Draw Calls: -`;
  drawCallsText.style.fontSize = '10px';
  drawCallsText.style.opacity = '0.6';
  drawCallsText.style.marginTop = '2px';
  
  const charSlider = document.createElement('input');
  charSlider.type = 'range';
  charSlider.min = '1';
  charSlider.max = '20';
  charSlider.value = currentCharacterCount.toString();
  charSlider.step = '1';
  charSlider.style.cssText = `
    width: 100%;
    cursor: pointer;
  `;
  
  charSlider.oninput = (e) => {
    const count = parseInt((e.target as HTMLInputElement).value);
    charText.textContent = `Characters: ${count}`;
    updateCharacterCount(count);
  };
  
  charLabel.appendChild(charText);
  charLabel.appendChild(drawCallsText);
  charLabel.appendChild(charSlider);
  charControl.appendChild(charLabel);
  panel.appendChild(charControl);
  
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
    margin-bottom: 6px;
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
  
  // Performance profiler button
  const perfBtn = document.createElement('button');
  perfBtn.textContent = 'Log Performance Report';
  perfBtn.style.cssText = `
    width: 100%;
    padding: 6px;
    margin-bottom: 12px;
    background: rgba(200, 100, 100, 0.2);
    color: white;
    border: 1px solid rgba(200, 100, 100, 0.4);
    border-radius: 4px;
    cursor: pointer;
    font-family: monospace;
    font-size: 10px;
  `;
  perfBtn.onclick = () => {
    console.log('\n🔍 PERFORMANCE REPORT');
    console.log('═══════════════════════════════════════');
    
    // Renderer info
    console.log('\n📊 Renderer Info:');
    console.log(`  Draw Calls: ${renderer.info.render.calls}`);
    console.log(`  Triangles: ${renderer.info.render.triangles.toLocaleString()}`);
    console.log(`  Points: ${renderer.info.render.points}`);
    console.log(`  Lines: ${renderer.info.render.lines}`);
    console.log(`  Geometries: ${renderer.info.memory.geometries}`);
    console.log(`  Textures: ${renderer.info.memory.textures}`);
    
    // Renderer settings
    console.log('\n⚙️ Renderer Settings:');
    console.log(`  Pixel Ratio: ${renderer.getPixelRatio()}`);
    console.log(`  Canvas Size: ${renderer.domElement.width}×${renderer.domElement.height}`);
    console.log(`  Shadows Enabled: ${renderer.shadowMap.enabled}`);
    console.log(`  Shadow Map Type: ${renderer.shadowMap.type}`);
    console.log(`  Max Texture Size: ${renderer.capabilities.maxTextureSize}`);
    
    // Character info
    console.log('\n👥 Characters:');
    console.log(`  Count: ${characterInstances.length}`);
    console.log(`  Animation Mixers: ${animationStates.size}`);
    
    let totalSkinnedMeshes = 0;
    let totalBones = 0;
    let totalVertices = 0;
    
    characterInstances.forEach((char, idx) => {
      char.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.SkinnedMesh) {
          totalSkinnedMeshes++;
          totalBones += obj.skeleton.bones.length;
          totalVertices += obj.geometry.attributes.position.count;
        }
      });
    });
    
    console.log(`  Total Skinned Meshes: ${totalSkinnedMeshes}`);
    console.log(`  Total Bones: ${totalBones.toLocaleString()}`);
    console.log(`  Total Vertices: ${totalVertices.toLocaleString()}`);
    
    // Scene complexity
    console.log('\n🌍 Scene Complexity:');
    let meshCount = 0;
    let lightCount = 0;
    scene.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh) meshCount++;
      if (obj instanceof THREE.Light) lightCount++;
    });
    console.log(`  Total Meshes: ${meshCount}`);
    console.log(`  Total Lights: ${lightCount}`);
    
    // Check for potential bottlenecks
    console.log('\n⚠️ Potential Bottlenecks:');
    if (renderer.getPixelRatio() > 2) {
      console.log(`  • High pixel ratio (${renderer.getPixelRatio()}) - reduce to 2 max`);
    }
    if (renderer.shadowMap.enabled) {
      console.log(`  • Shadow maps enabled - can be expensive on mobile`);
    }
    if (totalVertices > 500000) {
      console.log(`  • High vertex count (${totalVertices.toLocaleString()}) - consider LOD`);
    }
    
    let usingBoneTextures = false;
    scene.traverse((o: any) => {
      if (o.skeleton?.boneTexture) usingBoneTextures = true;
    });
    if (!usingBoneTextures) {
      console.log(`  • Bone textures NOT in use - may hit uniform limits with many characters`);
    }
    
    console.log('\n═══════════════════════════════════════\n');
  };
  panel.appendChild(perfBtn);
  
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
  char.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.SkinnedMesh) {
      skinnedMeshCount++;
      hasSkeleton = true;
      console.log('  ✓ SkinnedMesh found:', obj.name, 'bones:', obj.skeleton?.bones.length);
      console.log('    - boneTexture:', !!obj.skeleton.boneTexture);
      console.log('    - vertices:', obj.geometry.attributes.position.count);
      
      // Check if all bones are weighted
      if (obj.geometry.attributes.skinWeight && obj.geometry.attributes.skinIndex) {
        const skinWeights = obj.geometry.attributes.skinWeight.array;
        const skinIndices = obj.geometry.attributes.skinIndex.array;
        const influencesPerVertex = 4; // Standard in Three.js
        let weightedVertices = 0;
        
        for (let i = 0; i < obj.geometry.attributes.position.count; i++) {
          let hasWeight = false;
          for (let j = 0; j < influencesPerVertex; j++) {
            const weightIdx = i * influencesPerVertex + j;
            if (skinWeights[weightIdx] > 0) {
              hasWeight = true;
              break;
            }
          }
          if (hasWeight) weightedVertices++;
        }
        
        console.log(`    - weighted vertices: ${weightedVertices}/${obj.geometry.attributes.position.count} (${(weightedVertices/obj.geometry.attributes.position.count*100).toFixed(1)}%)`);
      }
    } else if (obj instanceof THREE.Mesh) {
      meshCount++;
      console.log('  - Regular Mesh:', obj.name);
    } else if (obj instanceof THREE.Bone) {
      console.log('  - Bone:', obj.name);
    }
  });
  console.log(`  Summary: ${skinnedMeshCount} skinned meshes, ${meshCount} regular meshes`);
  console.log(`  Has skeleton: ${hasSkeleton}`);
  
  // Check bone texture usage and provide recommendations
  char.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.SkinnedMesh) {
      const boneCount = obj.skeleton.bones.length;
      const usesBoneTexture = !!obj.skeleton.boneTexture;
      
      if (!usesBoneTexture && boneCount > 150) {
        console.warn(`⚠️ Bone texture not enabled (${boneCount} bones with uniforms)`);
        console.log(`   This is OK for 1-2 characters, but may impact performance with 7+ characters.`);
        console.log(`   To enable bone textures, add ~50 dummy bones to reach 256+ total.`);
      } else if (usesBoneTexture) {
        console.log(`✅ Bone texture enabled! Can handle ${boneCount}+ bones efficiently.`);
      }
    }
  });
  
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
  
  // Store animations in template for cloning
  characterTemplate.animations = allClips;
  
  // Setup animation mixer if we have clips
  if (allClips.length > 0) {
    // Use the character scene as the mixer root
    const animState = setupAnimationMixer(char.scene, allClips);
    
    // Auto-play the first animation
    if (allClips.length > 0) {
      playAnimation(char.scene, allClips[0].name, true);
      console.log(`✓ Auto-playing first animation: "${allClips[0].name}"`);
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
  },
  // Bone diagnostics helper
  boneInfo: () => {
    const char = (window as any).animDebug.getCharacter();
    if (!char) {
      console.warn('No character found');
      return null;
    }
    
    const info: any = {
      skinnedMeshes: [],
      totalBones: 0,
      usesBoneTexture: false
    };
    
    char.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.SkinnedMesh) {
        const meshInfo = {
          name: obj.name,
          boneCount: obj.skeleton.bones.length,
          boneTexture: !!obj.skeleton.boneTexture,
          boneTextureSize: obj.skeleton.boneTexture ? `${obj.skeleton.boneTexture.image.width}x${obj.skeleton.boneTexture.image.height}` : 'N/A',
          vertices: obj.geometry.attributes.position.count
        };
        info.skinnedMeshes.push(meshInfo);
        info.totalBones = Math.max(info.totalBones, obj.skeleton.bones.length);
        info.usesBoneTexture = info.usesBoneTexture || !!obj.skeleton.boneTexture;
      }
    });
    
    console.log('🦴 Bone System Analysis:');
    console.log(`  Uses Bone Texture: ${info.usesBoneTexture ? '✅ YES' : '❌ NO (using uniforms)'}`);
    console.log(`  Total Bones: ${info.totalBones}`);
    console.log(`  Skinned Meshes: ${info.skinnedMeshes.length}`);
    console.table(info.skinnedMeshes);
    
    return info;
  }
};

console.log('💡 Animation debug helpers available via window.animDebug');
console.log('   - animDebug.play("ClipName") - play an animation');
console.log('   - animDebug.list() - list all animations');
console.log('   - animDebug.boneInfo() - show bone/skinning diagnostics');

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
  
  // Track draw calls before rendering
  renderer.info.reset();
  renderer.render(scene, camera);
  
  // Update draw calls display (only every 30 frames to reduce overhead)
  if (Math.floor(currentTime / 500) !== Math.floor(lastFrameTime / 500)) {
    const drawCallsEl = document.getElementById('drawCallsText');
    if (drawCallsEl) {
      drawCallsEl.textContent = `Draw Calls: ${renderer.info.render.calls} | Tris: ${(renderer.info.render.triangles / 1000).toFixed(1)}k | Geom: ${renderer.info.memory.geometries} | Tex: ${renderer.info.memory.textures}`;
    }
  }
  
  stats.end();
}
tick();
