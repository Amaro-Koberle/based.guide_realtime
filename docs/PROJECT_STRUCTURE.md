# Project Structure

## Directory Layout

```
based.guide_realtime/
├── README.md                    # Main project documentation
├── package.json                 # Node.js dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vite.config.ts               # Vite build configuration
│
├── src/                         # Three.js application source
│   ├── main.ts                  # Main app entry point
│   ├── style.css                # Global styles
│   └── counter.ts               # (unused legacy file)
│
├── public/                      # Static assets served by Vite
│   ├── CHAR_MrProBonobo.glb    # Character mesh + rig + animations
│   ├── ENV_ApeEscapeOffice.glb # Environment + lights
│   └── RT_SCENE_ApeEscape.glb  # Camera + animation data
│
├── scripts/                     # Blender export automation
│   ├── export.sh                # Main export script (runs all three below)
│   ├── export_char.py           # Character GLB export
│   ├── export_env.py            # Environment GLB export
│   └── export_rt_scene.py       # Scene GLB export
│
└── docs/                        # Documentation
    ├── EXPORT_WORKFLOW.md       # Blender → Three.js pipeline guide
    ├── PROJECT_STRUCTURE.md     # This file
    └── archive/                 # Old/outdated documentation
        ├── README.md
        ├── BLENDER_EXPORT_GUIDE.md
        ├── CURRENT_ISSUES.md
        ├── FIX_CHARACTER_EXPORT.md
        ├── PROPER_LINKED_WORKFLOW.md
        ├── QUICK_START.md
        └── README_WORKFLOW.md
```

## Key Files

### Source Code
- **`src/main.ts`** - Three.js application entry point
  - Loads three GLB files
  - Sets up camera, lights, scene
  - Implements mouse-follow camera system
  - Manages character animations
  - Handles material processing (skydome, ocean)

### Export Scripts
- **`scripts/export.sh`** - Main export command
  - Runs all three Python export scripts
  - Filters verbose Blender console output
  - Reports export success/failure

- **`scripts/export_char.py`** - Character export
  - Loads `CHAR_MrProBonobo_MASTER.blend`
  - Exports character mesh, rig, and animations
  - Output: `public/CHAR_MrProBonobo.glb`

- **`scripts/export_env.py`** - Environment export
  - Loads `ENV_ApeEscapeOffice_MASTER.blend`
  - Hides "WORKING" collections
  - Exports environment geometry and lights
  - Output: `public/ENV_ApeEscapeOffice.glb`

- **`scripts/export_rt_scene.py`** - Scene export
  - Loads `RT_SCENE_ApeEscape_MASTER.blend`
  - Exports camera position and animation data
  - Output: `public/RT_SCENE_ApeEscape.glb`

### Configuration
- **`package.json`** - Node.js project configuration
  - Scripts: `dev`, `build`, `preview`
  - Dependencies: three, @types/three, stats.js

- **`tsconfig.json`** - TypeScript compiler settings
- **`vite.config.ts`** - Vite bundler configuration
- **`vercel.json`** - Vercel deployment settings

## Source Blender Files

Located on Google Drive (not in repo):
```
~/Library/CloudStorage/GoogleDrive-.../My Drive/based.guide/3D/
├── assets/
│   ├── characters/MrProBonobo/
│   │   └── CHAR_MrProBonobo_MASTER.blend
│   └── environments/ApeEscapeOffice/
│       └── ENV_ApeEscapeOffice_MASTER.blend
└── realtime/
    └── RT_SCENE_ApeEscape_MASTER.blend
```

## Workflow

1. **Edit** - Modify Blender files on Google Drive
2. **Export** - Run `./scripts/export.sh` (with Blender closed)
3. **View** - Refresh browser to see changes
4. **Commit** - Git commit if changes are good

## File Size Reference

- `CHAR_MrProBonobo.glb` - ~10 MB (mesh + animations)
- `ENV_ApeEscapeOffice.glb` - ~20-30 MB (environment geometry)
- `RT_SCENE_ApeEscape.glb` - ~1 MB (camera + anim data only)

## Ignore Patterns

See `.gitignore` for excluded files:
- `node_modules/` - NPM dependencies
- `dist/` - Build output
- `.DS_Store` - macOS metadata

