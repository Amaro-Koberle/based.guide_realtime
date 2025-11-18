# Blender Export Guide for RT_SCENE

## Problem: Duplicate Environment Collections

When you have a "Working" collection and an "Export" collection in your environment blend file, and you link the "Export" collection into RT_SCENE, **both collections can end up in the GLB export**. This causes duplicate, intersecting geometry.

## Solutions

### Option 1: Hide the Working Collection in Blender (Recommended)

1. In your **ENV blend file**, make sure the "Working" collection is:
   - **Excluded from View Layer** (checkbox in the outliner, not just the eye icon)
   - Or set to **disabled** in the outliner (uncheck the checkbox next to the collection name)

2. Only the "Export" collection should be enabled in the View Layer

3. When you export the RT_SCENE GLB, disabled collections won't be included

### Option 2: Use Naming Conventions + Code Filtering

The Three.js loader now automatically hides objects with these patterns in their names:
- `Working`
- `WORKING` 
- `_working`
- `.working`

**To use this:**
1. Name your working collection something like `ENV_Working` or `Working_ApeEscapeOffice`
2. The code will automatically hide it at runtime

**To customize the patterns**, edit this section in `main.ts`:

```typescript
const hidePatterns = ['Working', 'WORKING', '_working', '.working'];
```

### Option 3: Export Only Selected Collections

1. In Blender GLB export settings:
   - **Include** → Check "Limit to Selected Objects"
   - Before exporting, select only the objects/collections you want
   - Or use "Active Collection" option if available

## Camera Setup

Make sure your camera in the RT_SCENE file:
1. Is named something recognizable (e.g., "Camera", "RT_Camera", "Main Camera")
2. Is **enabled/visible** in the scene
3. Is positioned and oriented where you want the Three.js camera to start
4. Has the correct FOV and clipping planes set

The code will automatically:
- Find the camera by checking for `THREE.Camera` type
- Copy position, rotation, and quaternion
- Copy FOV, near, and far planes (for PerspectiveCamera)
- Set up OrbitControls to look in the same direction

## Character Setup

The character will be automatically detected by:

1. **Name patterns** (first choice):
   - `CHAR`
   - `Character`
   - `MrProBonobo`
   - `Bonobo`

2. **SkinnedMesh** (fallback):
   - Looks for any `SkinnedMesh` objects
   - Uses the parent object as the character root
   - Needs to be visible (not hidden)

## Recommended RT_SCENE Structure

```
RT_SCENE_ApeEscape.blend
├── Camera (your scene camera)
├── Light (directional light, etc.)
├── CHAR_MrProBonobo (linked collection from CHAR file)
│   └── [Armature, meshes, etc.]
└── ENV_Export (linked collection from ENV file)
    └── [All environment objects]
```

## Export Settings

**File → Export → glTF 2.0 (.glb)**

### Include Tab
- [x] Limit to Selected Objects (if you want to be selective)
- [x] Visible Objects
- [x] Active Collection (if exporting single collection)
- [ ] Custom Properties (optional)

### Transform Tab
- Forward: -Z Forward
- Up: Y Up

### Geometry Tab
- [x] Apply Modifiers
- [x] UVs
- [x] Normals
- [x] Tangents (if using normal maps)
- [ ] Loose Edges/Points (usually not needed)

### Animation Tab
- [x] Animation
- [x] Bake Animation
- [x] Shape Keys (if using)
- [x] Skinning
- [x] Export Deformation Bones Only (recommended)
- [x] Optimize Animation Size

### Scene Graph
- Make sure only the collections you want are enabled in the View Layer
- Disabled collections won't export

## Debugging

After export, check the console in the browser. You should see:

```
🔍 COMPLETE SCENE HIERARCHY:
└─ [Scene] "Scene"
  └─ [PerspectiveCamera] "Camera"
  └─ [DirectionalLight] "Light"
  └─ [Object3D] "CHAR_MrProBonobo"
    └─ [SkinnedMesh] "Body"
    └─ [Bone] "Armature"
      └─ ...
  └─ [Object3D] "ENV_Export"
    └─ [Mesh] "Floor"
    └─ [Mesh] "Walls"
    └─ ...
```

If you see duplicates or unexpected objects, check:
1. View Layer settings in Blender
2. Collection enable/disable states
3. Object names for the hiding patterns

