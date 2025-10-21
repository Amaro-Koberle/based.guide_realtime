import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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

async function loadAll(): Promise<void> {
  console.log('Loading environment...');
  const env = await gltf.loadAsync('/models/ENV_ApeEscapeOffice.glb');
  console.log('Environment loaded:', env);
  
  // Process environment: enable shadows and adjust lights
  let meshCount = 0;
  env.scene.traverse((obj: THREE.Object3D) => {
    // Enable shadows on ALL meshes
    if (obj instanceof THREE.Mesh) {
      meshCount++;
      obj.castShadow = true;
      obj.receiveShadow = true;
      console.log('Mesh shadows enabled:', obj.name || '(unnamed)', 'castShadow:', obj.castShadow, 'receiveShadow:', obj.receiveShadow);
      const m = (obj as any).material;
      if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      
      // Extract skydome color for hemisphere light
      if (obj.name === 'Skydome' && m) {
        const skyColor = m.emissive || m.color;
        if (skyColor) {
          ambientFill.color.copy(skyColor);
          console.log('Hemisphere light sky color set from Skydome:', skyColor.getHexString());
        }
      }
    }
    
    // Adjust directional light intensity from GLB
    if (obj instanceof THREE.DirectionalLight) {
      console.log('Found directional light:', obj.name, 'Original intensity:', obj.intensity);
      obj.intensity = obj.intensity / 1000; // 1000x reduction
      obj.castShadow = true;
      // Configure shadow quality - perfect 8x8x8 cube for optimal shadow density
      obj.shadow.mapSize.width = 4096;
      obj.shadow.mapSize.height = 4096;
      obj.shadow.camera.near = 0.1;
      obj.shadow.camera.far = 16; // 16 units total depth (near to far) = ~8 each side from center
      obj.shadow.camera.left = -8;
      obj.shadow.camera.right = 8;
      obj.shadow.camera.top = 8;
      obj.shadow.camera.bottom = -8;
      obj.shadow.bias = -0.0001;
      obj.shadow.normalBias = 0.02;
      console.log('Adjusted intensity to:', obj.intensity);
      console.log('Shadow camera bounds: 12x12x24 cube');
      
      // Optional: Add shadow camera helper to visualize coverage (comment out in production)
      const helper = new THREE.CameraHelper(obj.shadow.camera);
      scene.add(helper);
      console.log('Shadow camera helper added');
    }
  });
  console.log('Total environment meshes with shadows enabled:', meshCount);
  
  scene.add(env.scene);

  console.log('Loading character...');
  const char = await gltf.loadAsync('/models/CHAR_MrProBonobo.glb');
  console.log('Character loaded:', char);
  
  // Enable shadows on character
  let charMeshCount = 0;
  char.scene.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      charMeshCount++;
      obj.castShadow = true;
      obj.receiveShadow = true;
      console.log('Character mesh shadows enabled:', obj.name || '(unnamed)', 'castShadow:', obj.castShadow, 'receiveShadow:', obj.receiveShadow);
      const m = (obj as any).material;
      if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    }
  });
  console.log('Total character meshes with shadows enabled:', charMeshCount);
  
  scene.add(char.scene);
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

function tick(): void {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
