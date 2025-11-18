# How to Fix: Character Not Exporting

## The Problem

Your `RT_SCENE_ApeEscape.glb` file contains:
- ✅ Environment (Sea_Pod with all furniture, walls, etc.)
- ✅ Camera (working correctly now)
- ✅ Animations (2 clips with proper bone transforms)
- ❌ **NO CHARACTER GEOMETRY** (0 SkinnedMesh objects)

**The issue is in Blender export**, not Three.js code.

---

## Why This Happens

When you link a collection into another blend file, Blender sometimes doesn't include the linked geometry when exporting, especially if:
1. The linked collection is not properly "made local" or "overridden"
2. The character is in a different scene
3. Export settings exclude linked data
4. The character collection is disabled

---

## Solution: Make the Character Exportable

### Option 1: Make the Linked Collection Local (Recommended)

1. **Open** `RT_SCENE_ApeEscape.blend`
2. **Find** the CHAR_MrProBonobo collection in the Outliner
3. **Right-click** on the collection
4. **Select** "Make Override" or "Make Local" → "Selected Objects and Data"
5. This converts the link into actual data in your RT_SCENE file
6. **Re-export** the GLB

### Option 2: Append Instead of Link

1. **Open** `RT_SCENE_ApeEscape.blend`
2. **Delete** the linked CHAR collection (if present)
3. **File** → **Append** (not Link!)
4. **Navigate** to `CHAR_MrProBonobo.blend`
5. **Go into** Collection folder
6. **Select** the character collection
7. **Append** it
8. **Re-export** the GLB

### Option 3: Export with Linked Data

1. **Open** `RT_SCENE_ApeEscape.blend`
2. **File** → **Export** → **glTF 2.0 (.glb)**
3. In export settings, look for:
   - **Include** → Check "Export Apply Modifiers"
   - **Include** → Uncheck "Limit to Selected Objects"
   - **Data** → Check "Custom Properties"
   - Try enabling any "Linked Data" or "Pack Images" options
4. **Export**

### Option 4: Select All Before Export

1. **Open** `RT_SCENE_ApeEscape.blend`
2. Press **A** to select all objects in the scene
3. Make sure character meshes are highlighted
4. **File** → **Export** → **glTF 2.0 (.glb)**
5. **Include** → Check "**Selected Objects**"
6. **Export**

---

## Verify in Blender Before Export

Before exporting, check these things:

### 1. Character is Visible
- Character meshes have **eye icon** open in outliner
- Collection is **enabled** (checkmark checked)
- Character is in the **active scene**

### 2. Character Has Geometry
- Select a character mesh
- In Properties panel → Mesh Data → should show vertex/face count
- If it shows 0 or "Linked Data", it's just a reference without geometry

### 3. Armature is Connected
- Select character mesh
- Check **Modifiers** panel
- Should have **Armature modifier** pointing to the rig
- Modifier should NOT be disabled

### 4. Check the Scene
- Make sure you're in the correct scene (Scene selector in top bar)
- All objects (character, environment, camera) should be in the SAME scene

---

## Export Settings Checklist

When exporting, use these settings:

```
File → Export → glTF 2.0 (.glb)

[Include Tab]
☑ Selected Objects (only if you selected everything)
☑ Visible Objects
☑ Active Collection
☑ Renderable Objects
☑ Custom Properties

[Transform Tab]
Forward: -Z Forward
Up: Y Up

[Geometry Tab]
☑ Apply Modifiers
☑ UVs
☑ Normals
☑ Tangents
☑ Vertex Colors
☐ Loose Edges & Vertices

[Animation Tab]
☑ Animation
☑ Bake Animation  
☑ Shape Keys
☑ Skinning
☑ Export Deformation Bones Only
☐ Flatten Bone Hierarchy

[Compression]
☐ Compress (disable for testing)
```

---

## Test After Re-Export

After placing the new GLB in `/public/`, refresh browser and check console for:

```
✅ - Found X SkinnedMesh objects (should be > 0!)
✅ - Character found: "CHAR_MrProBonobo" or similar
✅ - Visible meshes: [high number]
```

If you still see `- Found 0 SkinnedMesh objects`, the character geometry is still not in the GLB.

---

## Alternative: Export Character Separately (Temporary Test)

To verify Three.js code works:

1. **Export just the character** from `CHAR_MrProBonobo.blend`
2. **Place it** in `/public/test_char.glb`
3. **Temporarily change** the load path in code to test:
   ```typescript
   const sceneGltf = await gltf.loadAsync('/test_char.glb');
   ```
4. If character shows up, the issue is definitely the RT_SCENE export

---

## Current vs. Desired State

### What Your GLB Currently Has:
```
RT_SCENE_ApeEscape.glb
├── Scene_1
│   └── Sea_Pod_1 (environment - all furniture, walls, etc.)
├── Camera (working!)
└── Animations (working! But animating what? No character!)
```

### What It SHOULD Have:
```
RT_SCENE_ApeEscape.glb
├── Scene
│   ├── Camera
│   ├── CHAR_MrProBonobo (with SkinnedMesh geometry!)
│   │   ├── Armature (bones)
│   │   └── Body (SkinnedMesh)
│   └── ENV_Export (environment)
└── Animations (animating the character above)
```

---

## Summary

**The code is working correctly.** The environment displays, the camera is positioned correctly, and animations are ready to play. But there's **no character geometry in the GLB file**.

**Next step:** Follow Option 1 or Option 2 above to make the character part of the RT_SCENE file before export.

