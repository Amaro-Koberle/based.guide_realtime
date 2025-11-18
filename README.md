# based.guide_realtime

Interactive 3D scene of the Ape Escape Consulting Office with Mr. Pro Bonobo.

Built with Three.js, TypeScript, and Vite.

## Features

- ✨ Real-time 3D rendering with optimized lighting and shadows
- 🎮 Mouse-controlled camera with parallax and click-to-zoom
- 🎭 Animated character with smooth animation playback
- 🌅 Dynamic skydome and ocean backdrop
- 📦 Multi-GLB asset pipeline (character, environment, scene)
- ⚡ Performance optimizations with FPS limiting and auto-pause
- 🐛 Collapsible debug panel with skeleton viewer

## Quick Start

### Development
```bash
npm install
npm run dev
```

### Exporting from Blender
```bash
./scripts/export.sh
```
See [docs/EXPORT_WORKFLOW.md](docs/EXPORT_WORKFLOW.md) for details.

### Build
```bash
npm run build
npm run preview
```

## Tech Stack

- **Three.js** - 3D rendering engine
- **TypeScript** - Type safety
- **Vite** - Build tooling
- **Blender** - 3D asset creation

## Asset Pipeline

The project uses a three-file GLB export system:

1. **`CHAR_MrProBonobo.glb`** - Character mesh, rig, and animations
2. **`ENV_ApeEscapeOffice.glb`** - Environment geometry and lights
3. **`RT_SCENE_ApeEscape.glb`** - Camera position and animation data

Benefits:
- Modular assets that can be updated independently
- Faster iteration (change character without re-exporting environment)
- Smaller file sizes (reuse character in multiple scenes)

## Camera Controls

- **Mouse Move**: Camera angles to follow cursor (subtle parallax)
- **Click + Hold**: Zoom in towards cursor position
- **Release**: Zoom back out to default position

## Performance Features

- ✅ **FPS Limiting**: Default 60 FPS, adjustable 30-120 FPS
- ✅ **Auto-Pause**: Stops rendering when tab is hidden
- ✅ **Pixel Ratio Cap**: Limits to 2x for high-DPI displays
- ✅ **Optimized Renderer**: Disables unused buffers

## Debug Panel

Press the collapsed panel in the top-left to access:
- **Show Skeleton**: Toggle character bone visualization
- **FPS Display**: Real-time performance monitoring
- **FPS Cap Slider**: Adjust frame rate limit

## Project Structure

```
based.guide_realtime/
├── src/
│   └── main.ts          # Main Three.js app
├── public/
│   ├── CHAR_MrProBonobo.glb
│   ├── ENV_ApeEscapeOffice.glb
│   └── RT_SCENE_ApeEscape.glb
├── scripts/             # Blender export automation
│   ├── export.sh
│   ├── export_char.py
│   ├── export_env.py
│   └── export_rt_scene.py
└── docs/
    └── EXPORT_WORKFLOW.md
```

## Known Issues

- Character has a temporary -5cm Y offset to match visual appearance from Blender (cause unknown)

## Documentation

- [Export Workflow](docs/EXPORT_WORKFLOW.md) - Blender to Three.js pipeline
- [Project Structure](docs/PROJECT_STRUCTURE.md) - Directory layout and file organization

