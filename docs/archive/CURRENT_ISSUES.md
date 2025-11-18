# Current Issues with RT_SCENE Export

## Based on Console Analysis

### Issue 1: No Character in Export ❌

**Problem**: The GLB contains 0 SkinnedMesh objects - the character was not exported.

**Diagnosis**:
- Animations are present (2 clips with bone transforms)
- Environment is present
- Camera is present (1 camera found)
- But no character geometry!

**Possible Causes**:
1. Character collection is not linked into RT_SCENE
2. Character collection is disabled/hidden in Blender
3. Character is in a different scene in the Blender file
4. Export settings exclude the character

**Fix in Blender**:
1. Open `RT_SCENE_ApeEscape.blend`
2. Check if `CHAR_MrProBonobo` collection is linked (File → Link)
3. Make sure the character collection is:
   - **Enabled** in the outliner (checkmark next to collection name)
   - **Included in View Layer** (checkbox in outliner, not just eye icon)
   - **Visible** (eye icon open)
4. Check that the character meshes have the Armature modifier applied
5. When exporting:
   - Include → **Visible Objects** (checked)
   - Include → **Active Collection** (unchecked, unless RT_SCENE is active)
   - Animation → **Skinning** (checked)

---

### Issue 2: Duplicate Environment (Intersecting Geometry) ❌

**Problem**: GLB contains duplicate environment objects - one in `Scene_1` at root level, and another complete copy inside `Sea_Pod_1` collection.

**From Console**:
```
└─ [Group] "Scene_1"
  └─ [Mesh] "Bush_Original"      ← Environment objects at root
  └─ [Mesh] "Carpet"
  └─ [Mesh] "Office_Chair_1"
  ... (many more objects)
  └─ [Object3D] "Sea_Pod_1"      ← Duplicate environment inside here
    └─ [Mesh] "Bush_Instance_2"
    └─ [Mesh] "Carpet001_2"
    └─ [Mesh] "Office_Chair_Instance_2"
    ... (complete duplicate of everything above)
```

**Temporary Fix**: 
Code now hides `Sea_Pod_1` automatically. You should see in console:
```
🚫 Hiding unwanted collections...
  ✓ Hidden: "Sea_Pod_1"
```

**Proper Fix in Blender**:
Your ENV blend file likely has:
- **Working Collection** (at origin, for convenience)
- **Export Collection** (positioned correctly, contains instances/links)

When you link the **Export** collection into RT_SCENE, Blender is somehow bringing in BOTH collections.

**Solutions**:

**Option A: Disable Working Collection Before Export**
1. In your ENV blend file, find the "Working" collection
2. In the Outliner, **uncheck the checkbox** next to it (disables it completely)
3. Or right-click → "Exclude from View Layer"
4. Save the ENV file
5. Re-export RT_SCENE - only Export collection should be included now

**Option B: Use Collection Instance Instead of Link**
1. In RT_SCENE, instead of linking the collection:
2. Object → Collection Instance → Select your ENV Export collection
3. This creates a single instance, avoiding the duplicate issue

**Option C: Export Only What You Need**
1. In RT_SCENE, before exporting:
2. Hide or disable the collections you don't want
3. Export settings → Include → **Selected Objects** (check this)
4. Select only the objects/collections you want in the final GLB

---

### Issue 3: Camera Not Found in Scene Hierarchy ⚠️

**Problem**: GLB has `cameras: Array(1)` but camera not appearing in scene hierarchy.

**Status**: Code now checks `sceneGltf.cameras` array directly (more reliable).

**Expected Console Output After Fix**:
```
📷 Searching for camera...
  - Found 1 camera(s) in GLB cameras array
  - Using camera: "Camera" (type: PerspectiveCamera)
    ✓ Found camera in scene hierarchy with transforms
    - Position: [x, y, z]
    - World Position: [x, y, z]
✓ Camera position and orientation applied from GLB
```

---

## Quick Checklist for Re-Export

Before exporting RT_SCENE_ApeEscape.glb:

- [ ] Character collection (CHAR_MrProBonobo) is linked and visible
- [ ] Character has SkinnedMesh with armature
- [ ] Environment "Working" collection is disabled
- [ ] Only "Export" environment collection is visible
- [ ] Camera is in the scene and visible
- [ ] Animations are on the timeline or in NLA strips

**Export Settings**:
- [ ] Format: glTF 2.0 (.glb)
- [ ] Include → Visible Objects
- [ ] Transform → +Y Up, -Z Forward
- [ ] Geometry → Apply Modifiers
- [ ] Animation → Animation, Bake Animation, Skinning
- [ ] Animation → Export Deformation Bones Only

---

## Testing After Re-Export

After placing the new GLB in `/public/RT_SCENE_ApeEscape.glb`:

1. Refresh browser
2. Check console for:
   - ✓ Camera found and applied
   - ✓ Character found (SkinnedMesh count > 0)
   - ✓ Environment visible (no duplicates)
   - ✓ Animations playing

3. Visually check:
   - Character is visible and in correct position
   - Environment is single copy (no intersecting geometry)
   - Camera view matches Blender viewport
   - Animation is playing smoothly

