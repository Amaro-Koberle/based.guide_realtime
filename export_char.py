#!/usr/bin/env python3
"""
Character GLB Export Script
Exports the character with animations from CHAR_MrProBonobo_MASTER.blend
"""

import bpy
import sys
import os

# Configuration
CHAR_FILE = "/Users/amaro/Library/CloudStorage/GoogleDrive-amaro@amarokoberle.com/My Drive/based.guide/3D/assets/characters/MrProBonobo/CHAR_MrProBonobo_MASTER.blend"
PROJECT_DIR = "/Users/amaro/Documents/dev/based.guide_realtime"
OUTPUT_GLB = os.path.join(PROJECT_DIR, "public", "CHAR_MrProBonobo.glb")

def export_character():
    print("\n" + "="*60)
    print("Character Export Script")
    print("="*60)
    
    # Load the character file
    print(f"\n1. Loading character file: {CHAR_FILE}")
    bpy.ops.wm.open_mainfile(filepath=CHAR_FILE)
    print("   ✓ File loaded")
    
    # Verify contents
    print("\n2. Verifying character contents...")
    skinned_meshes = [obj for obj in bpy.data.objects 
                      if obj.type == 'MESH' 
                      and obj.modifiers 
                      and any(m.type == 'ARMATURE' for m in obj.modifiers)]
    print(f"   - SkinnedMeshes: {len(skinned_meshes)}")
    
    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    print(f"   - Armatures: {len(armatures)}")
    
    animations = bpy.data.actions
    print(f"   - Animations: {len(animations)}")
    if animations:
        for action in list(animations)[:5]:
            print(f"      • {action.name}")
    
    if len(skinned_meshes) == 0:
        print("\n   ⚠️ WARNING: No skinned meshes found!")
        sys.exit(1)
    
    # Export
    print(f"\n3. Exporting to: {OUTPUT_GLB}")
    print("   (Animation warnings suppressed for cleaner output)")
    
    try:
        bpy.ops.export_scene.gltf(
            filepath=OUTPUT_GLB,
            export_format='GLB',
            
            # Include settings
            use_selection=False,
            use_visible=True,
            use_active_collection=False,
            
            # What to export
            export_cameras=False,  # No camera in character file
            export_lights=False,   # No lights in character file
            
            # Transform
            export_yup=True,
            
            # Geometry
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_tangents=True,
            
            # Animation
            export_animations=True,
            export_anim_single_armature=True,
            export_nla_strips=True,
            export_def_bones=True,
            export_optimize_animation_size=True,
            
            # Skinning
            export_skins=True,
            export_all_influences=False,
            
            # Compression
            export_draco_mesh_compression_enable=False,
        )
        print("   ✓ Export successful!")
    except Exception as e:
        print(f"\n❌ Export failed: {str(e)}")
        sys.exit(1)
    
    # Get file size
    file_size = os.path.getsize(OUTPUT_GLB) / (1024 * 1024)
    
    print("\n" + "="*60)
    print("✓ Character Export Complete!")
    print("="*60)
    print(f"\nGLB file: {OUTPUT_GLB}")
    print(f"File size: {file_size:.2f} MB")
    print(f"\n📊 Exported:")
    print(f"   - {len(skinned_meshes)} skinned mesh(es)")
    print(f"   - {len(armatures)} armature(s)")
    print(f"   - {len(animations)} animation(s)")
    print("="*60 + "\n")

if __name__ == "__main__":
    try:
        export_character()
    except KeyboardInterrupt:
        print("\n\n⚠️ Export cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

