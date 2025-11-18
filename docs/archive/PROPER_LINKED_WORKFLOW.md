# Proper Linked Asset Workflow for GLB Export

You're absolutely right - the whole point of your pipeline is to keep assets separated and linked! Here's how to do it properly.

## The Problem with Linked Collections

Blender's GLB exporter **does not include linked collection data by default**. When you link a collection from another file, it's just a reference, and the exporter doesn't follow that reference into other blend files.

## Solution: Automate with a Python Script

The cleanest solution is to automate the export process with a Blender Python script that:
1. Loads your RT_SCENE file
2. Temporarily brings in the linked data
3. Exports the GLB
4. All in one command

### Create This Export Script

Save this as `export_rt_scene.py` in your project folder:

```python
import bpy
import os
import sys

# Configuration
PROJECT_DIR = "/Users/amaro/Documents/dev/based.guide_realtime"
RT_SCENE_FILE = os.path.join(PROJECT_DIR, "RT_SCENE_ApeEscape.blend")
CHAR_FILE = os.path.join(PROJECT_DIR, "CHAR_MrProBonobo.blend")
OUTPUT_GLB = os.path.join(PROJECT_DIR, "public/RT_SCENE_ApeEscape.glb")

def export_rt_scene():
    """
    Export RT_SCENE with all linked assets included.
    Keeps source files clean and separated.
    """
    
    print("\n" + "="*60)
    print("RT_SCENE Export Script")
    print("="*60)
    
    # Clear current scene
    bpy.ops.wm.read_homefile(use_empty=True)
    
    # Open RT_SCENE file
    print(f"\n1. Loading RT_SCENE: {RT_SCENE_FILE}")
    bpy.ops.wm.open_mainfile(filepath=RT_SCENE_FILE)
    
    # Get all linked objects and make them local for export
    print("\n2. Making linked data exportable...")
    linked_objects = [obj for obj in bpy.data.objects if obj.library is not None]
    
    if linked_objects:
        print(f"   Found {len(linked_objects)} linked objects")
        
        # Select all linked objects
        bpy.ops.object.select_all(action='DESELECT')
        for obj in linked_objects:
            obj.select_set(True)
        
        # Make local (just for this session, doesn't save to file)
        print("   Making local for export (temporary)...")
        bpy.ops.object.make_local(type='SELECT_OBDATA')
        print("   ✓ Linked data now exportable")
    else:
        print("   ⚠️ No linked objects found - check your RT_SCENE file")
    
    # Verify we have a character with SkinnedMesh
    print("\n3. Verifying scene contents...")
    skinned_meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH' and obj.modifiers and any(m.type == 'ARMATURE' for m in obj.modifiers)]
    print(f"   - SkinnedMeshes found: {len(skinned_meshes)}")
    
    cameras = [obj for obj in bpy.data.objects if obj.type == 'CAMERA']
    print(f"   - Cameras found: {len(cameras)}")
    
    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    print(f"   - Armatures found: {len(armatures)}")
    
    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    print(f"   - Total meshes: {len(meshes)}")
    
    # Select all objects for export
    bpy.ops.object.select_all(action='SELECT')
    
    # Export GLB
    print(f"\n4. Exporting to: {OUTPUT_GLB}")
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLB,
        export_format='GLB',
        
        # Include settings
        use_selection=True,  # Export selected objects
        use_visible=True,    # Only visible objects
        use_active_collection=False,
        
        # Transform
        export_yup=True,  # +Y Up
        
        # Geometry
        export_apply=True,  # Apply modifiers
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_colors=True,
        
        # Animation
        export_animations=True,
        export_anim_single_armature=True,
        export_bake_animation=True,
        export_nla_strips=True,
        export_def_bones=True,  # Export deformation bones only
        export_optimize_animation_size=True,
        
        # Skinning
        export_skins=True,
        export_all_influences=False,  # Limit to 4 bone influences
        
        # Compression
        export_draco_mesh_compression_enable=False,  # Disable for debugging
    )
    
    print("\n" + "="*60)
    print("✓ Export Complete!")
    print("="*60)
    print(f"\nGLB file saved to: {OUTPUT_GLB}")
    print("\nNext: Refresh your browser to see the updated scene.")
    print("="*60 + "\n")

if __name__ == "__main__":
    export_rt_scene()
```

### How to Use the Script

#### Option 1: Run from Terminal (Recommended)

```bash
cd /Users/amaro/Documents/dev/based.guide_realtime
/Applications/Blender.app/Contents/MacOS/Blender --background --python export_rt_scene.py
```

#### Option 2: Run from Blender

1. Open Blender
2. Go to Scripting workspace
3. Open `export_rt_scene.py`
4. Click "Run Script"

#### Option 3: Create a Shell Script (Easiest)

Create `export.sh` in your project folder:

```bash
#!/bin/bash
echo "Exporting RT_SCENE to GLB..."
/Applications/Blender.app/Contents/MacOS/Blender --background --python export_rt_scene.py
echo "Done! Refresh browser to see changes."
```

Make it executable:
```bash
chmod +x export.sh
```

Then just run:
```bash
./export.sh
```

---

## How This Workflow Works

### In Your Blend Files (Source of Truth):

**CHAR_MrProBonobo.blend**
- Contains the character mesh, armature, materials
- This is your master character file
- Edit animations, adjust mesh, etc. here

**ENV_ApeEscapeOffice.blend**
- Contains the environment
- Organized in Export collection

**RT_SCENE_ApeEscape.blend**
- Links CHAR collection from CHAR file
- Links ENV collection from ENV file  
- Contains camera
- Contains animation timeline/NLA strips
- **Keeps the links** - never makes them local in this file

### When Exporting:

1. Script opens RT_SCENE
2. Script temporarily makes linked data local **in memory only**
3. Exports GLB with everything included
4. **Original files remain unchanged** - links still intact

### Iteration Workflow:

```
Edit character in CHAR.blend
↓
Save
↓
Run: ./export.sh
↓
Refresh browser
↓
See changes immediately!
```

No manual steps, no "make local", no duplicate data!

---

## Alternative: Blender Add-on

If you want even more automation, you could create a simple Blender add-on that adds an "Export RT Scene" button to your toolbar. But the script above is simpler and works great.

---

## Why This is Better Than Making Local

| Approach | Source Files | Export Speed | Data Duplication |
|----------|--------------|--------------|------------------|
| **Make Local** | ❌ Bloated | ✅ Fast | ❌ Yes |
| **Script** | ✅ Clean | ✅ Fast | ✅ No |
| **Manual Append/Delete** | ✅ Clean | ❌ Slow | ✅ No |

The script keeps your source files clean and separate while automating the export process.

---

## Troubleshooting

### If character still doesn't export:

1. **Check RT_SCENE file:**
   - Open RT_SCENE in Blender
   - Is the CHAR collection visible?
   - Are there objects inside it?
   - Try selecting an object - does it say "Linked Data" in properties?

2. **Check the link:**
   - File → External Data → Report Missing Files
   - If link is broken, re-link: File → Link → navigate to CHAR file

3. **Run script with Blender UI open** (not background) to see errors

### If script errors:

- Update Blender paths in the script
- Update file paths to match your actual file names
- Make sure RT_SCENE has the linked collections

---

## Summary

**You're right** - making things local defeats the purpose of your pipeline!

**Use the export script instead:**
- ✅ Keeps CHAR and ENV files separate and clean
- ✅ RT_SCENE file keeps its links intact
- ✅ One command exports everything properly
- ✅ Fast iteration: edit → export → refresh

This is exactly how professional game/3D pipelines work!

