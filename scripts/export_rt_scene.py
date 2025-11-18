import bpy
import os
import sys

# Configuration - Paths to your Blender files and output
REALTIME_DIR = "/Users/amaro/Library/CloudStorage/GoogleDrive-amaro@amarokoberle.com/My Drive/based.guide/3D/realtime"
RT_SCENE_FILE = os.path.join(REALTIME_DIR, "RT_SCENE_ApeEscape_MASTER.blend")

# Output GLB goes to the public folder of your web project
PROJECT_DIR = "/Users/amaro/Documents/dev/based.guide_realtime"
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
    if not os.path.exists(RT_SCENE_FILE):
        print(f"❌ ERROR: RT_SCENE file not found at: {RT_SCENE_FILE}")
        print("   Update the path in this script to match your file location.")
        sys.exit(1)
    
    bpy.ops.wm.open_mainfile(filepath=RT_SCENE_FILE)
    
    # Hide "Working" collections to avoid duplicates
    print("\n   Hiding 'Working' collections to avoid duplicates...")
    hidden_count = 0
    for collection in bpy.data.collections:
        if "Working" in collection.name:
            collection.hide_viewport = True
            collection.hide_render = True
            hidden_count += 1
            print(f"      - Hidden: {collection.name}")
    if hidden_count == 0:
        print("      (No 'Working' collections found)")
    else:
        print(f"      ✓ Hidden {hidden_count} 'Working' collection(s)")
    
    # Get all linked data and make it local for export
    print("\n2. Processing linked data...")
    
    # Count linked data blocks
    linked_objects = [obj for obj in bpy.data.objects if obj.library is not None]
    linked_meshes = [mesh for mesh in bpy.data.meshes if mesh.library is not None]
    linked_cameras = [cam for cam in bpy.data.cameras if cam.library is not None]
    linked_lights = [light for light in bpy.data.lights if light.library is not None]
    linked_armatures = [arm for arm in bpy.data.armatures if arm.library is not None]
    
    if linked_objects:
        print(f"   Found {len(linked_objects)} linked objects")
        print(f"   Found {len(linked_meshes)} linked meshes")
        print(f"   Found {len(linked_cameras)} linked cameras")
        print(f"   Found {len(linked_lights)} linked lights")
        print(f"   Found {len(linked_armatures)} linked armatures")
        
        # List first few linked objects
        for obj in linked_objects[:5]:
            print(f"      - {obj.name} (from {os.path.basename(obj.library.filepath)})")
        if len(linked_objects) > 5:
            print(f"      ... and {len(linked_objects) - 5} more")
        
        # The GLTF exporter can actually handle library-linked data directly!
        # We don't need to make it local - just ensure it's in the scene.
        # This avoids all the duplication issues.
        print("\n   ✓ Library-linked data will be exported directly (no localization needed)")
    else:
        print("   ⚠️ WARNING: No linked objects found!")
        print("   Your RT_SCENE file might not have linked collections.")
        print("   The export will continue but may not include character.")
    
    # Verify we have a character with SkinnedMesh
    print("\n3. Verifying scene contents...")
    
    # Remove duplicate objects (same name, not in scene) before checking
    print("   - Checking for duplicate orphaned objects...")
    scene_object_names = {obj.name for obj in bpy.context.scene.objects}
    duplicates_removed = 0
    for obj in list(bpy.data.objects):
        # If object exists in bpy.data but not in scene, and there's another with same base name in scene
        if obj.name not in scene_object_names:
            base_name = obj.name.split('.')[0]  # Strip .001 suffix if any
            if any(o.name.startswith(base_name) and o.name in scene_object_names for o in bpy.data.objects):
                print(f"      • Removing orphaned duplicate: {obj.name}")
                bpy.data.objects.remove(obj)
                duplicates_removed += 1
    if duplicates_removed > 0:
        print(f"      ✓ Removed {duplicates_removed} orphaned duplicate(s)")
    else:
        print("      (No duplicates found)")
    
    # Check ALL objects in the file
    all_objects = list(bpy.data.objects)
    skinned_meshes = [obj for obj in all_objects
                      if obj.type == 'MESH' 
                      and not obj.hide_viewport
                      and obj.modifiers 
                      and any(m.type == 'ARMATURE' for m in obj.modifiers)]
    print(f"   - SkinnedMeshes (character): {len(skinned_meshes)}")
    if skinned_meshes:
        for i, mesh in enumerate(skinned_meshes):
            visible = not mesh.hide_viewport and not mesh.hide_render
            in_scene = mesh.name in {o.name for o in bpy.context.scene.objects}
            # Check if it's the same object instance
            is_unique = mesh.name
            print(f"      [{i}] {mesh.name} (viewport: {not mesh.hide_viewport}, in_scene: {in_scene}, id: {id(mesh)}, loc: {mesh.location[:]}, lib: {mesh.library})")
    
    cameras = [obj for obj in all_objects if obj.type == 'CAMERA' and not obj.hide_viewport]
    print(f"   - Cameras: {len(cameras)}")
    
    armatures = [obj for obj in all_objects if obj.type == 'ARMATURE' and not obj.hide_viewport]
    print(f"   - Armatures (rigs): {len(armatures)}")
    
    meshes = [obj for obj in all_objects if obj.type == 'MESH' and not obj.hide_viewport]
    print(f"   - Total meshes: {len(meshes)}")
    
    # Check for animations
    animations = bpy.data.actions
    print(f"   - Animations: {len(animations)}")
    if animations:
        for action in list(animations)[:3]:  # Show first 3
            print(f"      • {action.name}")
    
    # Warnings
    if len(skinned_meshes) == 0:
        print("\n   ⚠️ WARNING: No SkinnedMeshes found!")
        print("   The character may not be properly linked or has no armature modifier.")
    
    if len(meshes) < 10:  # Should have way more meshes if environment is included
        print("\n   ⚠️ WARNING: Very few meshes found - is the environment collection linked?")
        print("   In Blender: File → Link → ENV_ApeEscapeOffice_MASTER.blend → Select ENV collection")
    
    if len(cameras) == 0:
        print("\n   ⚠️ WARNING: No cameras found!")
    
    # Count objects for export
    print("\n4. Preparing export...")
    
    # Strategy: If we have BOTH a library-linked object AND a local override with the same name,
    # temporarily hide the library-linked one
    override_objects = {obj.name: obj for obj in all_objects if obj.library is None}
    
    hidden_for_export = []
    for obj in all_objects:
        # Only hide if: (1) it's library-linked, (2) we have an override with same name
        if obj.library is not None and obj.name in override_objects:
            obj.hide_viewport = True
            obj.hide_render = True
            hidden_for_export.append(obj.name)
            print(f"   • Hiding linked duplicate (override exists): {obj.name}")
    
    if hidden_for_export:
        print(f"   ✓ Temporarily hidden {len(hidden_for_export)} linked duplicate(s)")
    
    export_objects = [obj for obj in all_objects if not obj.hide_viewport]
    print(f"   Will export {len(export_objects)} objects")
    
    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(OUTPUT_GLB)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"   Created directory: {output_dir}")
    
    # Export GLB
    print(f"\n5. Exporting to: {OUTPUT_GLB}")
    print("   (Animation bone warnings suppressed for cleaner output)")
    try:
        bpy.ops.export_scene.gltf(
            filepath=OUTPUT_GLB,
            export_format='GLB',
            
            # Include settings
            use_selection=False,  # Export all objects (not just selected)
            use_visible=True,     # Only export visible objects (respects Blender viewport visibility)
            use_active_collection=False,
            
            # What to export
            export_cameras=True,   # CRITICAL: Include cameras
            export_lights=True,    # CRITICAL: Include lights
            
            # Transform
            export_yup=True,  # +Y Up
            
            # Geometry
            export_apply=True,  # Apply modifiers
            export_texcoords=True,
            export_normals=True,
            export_tangents=True,
            # export_colors removed - not available in this Blender version
            
            # Animation
            export_animations=True,
            export_anim_single_armature=True,
            export_nla_strips=True,
            export_def_bones=True,  # Export deformation bones only
            export_optimize_animation_size=True,
            
            # Skinning
            export_skins=True,
            export_all_influences=False,  # Limit to 4 bone influences
            
            # Compression
            export_draco_mesh_compression_enable=False,  # Disable for debugging
        )
        print("   ✓ Export successful!")
    except Exception as e:
        print(f"\n❌ Export failed with error:")
        print(f"   {str(e)}")
        sys.exit(1)
    
    # Get file size
    file_size = os.path.getsize(OUTPUT_GLB) / (1024 * 1024)  # Convert to MB
    
    # Count what was actually exported (after hiding duplicates)
    final_skinned_meshes = [obj for obj in export_objects
                            if obj.type == 'MESH' 
                            and obj.modifiers 
                            and any(m.type == 'ARMATURE' for m in obj.modifiers)]
    final_armatures = [obj for obj in export_objects if obj.type == 'ARMATURE']
    
    print("\n" + "="*60)
    print("✓ Export Complete!")
    print("="*60)
    print(f"\nGLB file: {OUTPUT_GLB}")
    print(f"File size: {file_size:.2f} MB")
    print("\n📊 Exported:")
    print(f"   - {len(export_objects)} objects")
    print(f"   - {len(final_skinned_meshes)} skinned meshes (character)")
    print(f"   - {len(final_armatures)} armatures")
    print(f"   - {len(cameras)} cameras")
    print(f"   - {len(animations)} animations")
    print("\n🔄 Next: Refresh your browser to see the updated scene.")
    print("="*60 + "\n")

if __name__ == "__main__":
    try:
        export_rt_scene()
    except KeyboardInterrupt:
        print("\n\n⚠️ Export cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

