# Blender to Three.js Export Workflow

## Quick Start

**⚠️ Close Blender before exporting!**

```bash
./scripts/export.sh
```

This exports three GLB files from your Blender project to the `public/` folder:
- `CHAR_MrProBonobo.glb` - Character mesh, rig, and animations
- `ENV_ApeEscapeOffice.glb` - Environment, lights
- `RT_SCENE_ApeEscape.glb` - Camera position and animation data

## File Locations

### Source Blender Files (Google Drive)
- **Character**: `~/Library/CloudStorage/GoogleDrive-.../based.guide/3D/assets/characters/MrProBonobo/CHAR_MrProBonobo_MASTER.blend`
- **Environment**: `~/Library/CloudStorage/GoogleDrive-.../based.guide/3D/assets/environments/ApeEscapeOffice/ENV_ApeEscapeOffice_MASTER.blend`
- **Scene/Camera/Animations**: `~/Library/CloudStorage/GoogleDrive-.../based.guide/3D/realtime/RT_SCENE_ApeEscape_MASTER.blend`

### Export Scripts
- `scripts/export_char.py` - Exports character with animations
- `scripts/export_env.py` - Exports environment with lights
- `scripts/export_rt_scene.py` - Exports camera and animation data
- `scripts/export.sh` - Runs all three exports

### Output (Web Project)
- `public/CHAR_MrProBonobo.glb`
- `public/ENV_ApeEscapeOffice.glb`
- `public/RT_SCENE_ApeEscape.glb`

## Workflow

1. **Edit in Blender** - Make changes to any of the source files
2. **Save and Close Blender**
3. **Export** - Run `./scripts/export.sh`
4. **Refresh Browser** - See your changes live

## Why Three Files?

This separation allows:
- **Character** - Reusable across different scenes/environments
- **Environment** - Can be updated without touching character
- **Scene** - Contains camera position and animations that reference the character

Three.js loads all three and combines them at runtime.

## Troubleshooting

### Export script not found
Run from project root: `./scripts/export.sh` (not from within `scripts/` directory)

### Files don't update in browser
Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Character not appearing
Check console output - should show "1 skinned mesh(es)" in character export

### Environment looks wrong
Check that "WORKING" collections are hidden in your ENV blend file

