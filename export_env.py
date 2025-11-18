import bpy
import os
import sys

# Configuration
PROJECT_DIR = "/Users/amaro/Documents/dev/based.guide_realtime"
ENV_FILE = "/Users/amaro/Library/CloudStorage/GoogleDrive-amaro@amarokoberle.com/My Drive/based.guide/3D/assets/environments/ApeEscapeOffice/ENV_ApeEscapeOffice_MASTER.blend"
OUTPUT_GLB = os.path.join(PROJECT_DIR, "public", "ENV_ApeEscapeOffice.glb")

def export_environment():
    print("=" * 60)
    print("Environment Export Script")
    print("=" * 60)

    # 1. Load the environment Blender file
    print(f"\n1. Loading environment file: {ENV_FILE}")
    try:
        bpy.ops.wm.open_mainfile(filepath=ENV_FILE)
        print("   ✓ File loaded")
    except Exception as e:
        print(f"❌ Error loading file: {e}")
        sys.exit(1)

    # 2. Verify environment contents
    print("\n2. Verifying environment contents...")
    all_objects = list(bpy.data.objects)
    
    meshes = [obj for obj in all_objects if obj.type == 'MESH']
    lights = [obj for obj in all_objects if obj.type == 'LIGHT']
    cameras = [obj for obj in all_objects if obj.type == 'CAMERA']
    
    print(f"   - Meshes: {len(meshes)}")
    print(f"   - Lights: {len(lights)}")
    print(f"   - Cameras: {len(cameras)}")
    
    if len(meshes) == 0:
        print("\n   ⚠️ WARNING: No meshes found!")
        print("   This might be normal if environment is in collections.")
    
    # 3. Hide "Working" collections (export only "EXPORT" collection)
    print("\n3. Preparing collections for export...")
    hidden_collections = []
    
    for collection in bpy.data.collections:
        if "WORKING" in collection.name.upper():
            collection.hide_viewport = True
            collection.hide_render = True
            hidden_collections.append(collection.name)
            print(f"   • Hiding: {collection.name}")
    
    if hidden_collections:
        print(f"   ✓ Hidden {len(hidden_collections)} working collection(s)")
    
    # Count what will actually be exported
    export_objects = [obj for obj in all_objects if not obj.hide_viewport and not obj.hide_render]
    export_meshes = [obj for obj in export_objects if obj.type == 'MESH']
    
    print(f"   Will export {len(export_objects)} objects ({len(export_meshes)} meshes)")

    # 4. Export GLB
    print(f"\n4. Exporting to: {OUTPUT_GLB}")
    try:
        bpy.ops.export_scene.gltf(
            filepath=OUTPUT_GLB,
            export_format='GLB',
            use_selection=False,
            use_visible=True,  # Only export visible objects
            export_cameras=False,  # Cameras are in RT_SCENE, not ENV
            export_lights=True,
            export_yup=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_tangents=True,
            export_animations=False,  # No animations in environment file
            export_skins=False,  # No rigged meshes in environment
            export_draco_mesh_compression_enable=False,
        )
        print("   ✓ Export successful!")
    except Exception as e:
        print(f"\n❌ Export failed with error:")
        print(f"   {str(e)}")
        sys.exit(1)

    # Get file size
    file_size = os.path.getsize(OUTPUT_GLB) / (1024 * 1024)  # Convert to MB

    print("\n" + "=" * 60)
    print("✓ Environment Export Complete!")
    print("=" * 60)
    print(f"\nGLB file: {OUTPUT_GLB}")
    print(f"File size: {file_size:.2f} MB")
    print("\n📊 Exported:")
    print(f"   - {len(export_meshes)} mesh(es)")
    print(f"   - {len(lights)} light(s)")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    export_environment()

