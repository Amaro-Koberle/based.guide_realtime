# based.guide_realtime

Interactive 3D scene of the Ape Escape Consulting Office with Mr. Pro Bonobo.

Built with Three.js, TypeScript, and Vite.

## Features

- Real-time 3D rendering with optimized lighting and shadows
- Dynamic GLB model loading with texture compression
- Automatic skydome-based ambient lighting
- Responsive design for desktop and mobile
- **Runtime character animation system** with crossfading and multiple clip support
- **Performance optimizations** with FPS limiting and auto-pause when tab is hidden

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Tech Stack

- **Three.js** - 3D rendering engine
- **TypeScript** - Type safety
- **Vite** - Build tooling

## Animation System

The app includes a flexible runtime animation system that supports:

### Features
- ✅ Loads animations from both embedded GLB and separate animation files
- ✅ One AnimationMixer per character root
- ✅ Multiple animation clips with smooth crossfading
- ✅ Automatic clip detection and fallback handling
- ✅ Debug helpers for listing and testing animations

### File Structure
- Character model: `/models/CHAR_MrProBonobo.glb`
- Animations: `/anims/ANIM_RT_MrProBonobo.glb`

### Debug Console API

Open browser console and use these helpers:

```javascript
// List all available animations
animDebug.list()

// Play an animation (loops by default)
animDebug.play('Test_Baked')

// Play animation without looping
animDebug.play('AnimationName', false)

// Stop current animation
animDebug.stopAnimation(animDebug.getCharacter())
```

### Code Usage

```typescript
// Play an animation with crossfade
playAnimation(characterRoot, 'ClipName', loop = true, crossfadeDuration = 0.3)

// Stop animation with fade out
stopAnimation(characterRoot, fadeOutDuration = 0.3)

// List available clips
debugListClips(animationClipsArray)
```

### How It Works

1. **Loading**: The system loads the character GLB first, then attempts to load a separate animation GLB
2. **Clip Detection**: It checks both files for animation clips and merges them
3. **Auto-Play**: Tries to play "Test_Baked" animation, with fallback to variations or first available clip
4. **Runtime**: AnimationMixer updates every frame in the render loop
5. **Crossfading**: Smooth transitions between animations with configurable fade duration

## Performance Optimizations

The app includes several optimizations to reduce battery drain and heat:

### Automatic Features
- ✅ **FPS Limiting**: Capped at 60 FPS by default (adjustable via UI slider)
- ✅ **Tab Visibility Detection**: Automatically pauses rendering when tab is hidden
- ✅ **Pixel Ratio Cap**: Limits to 2x to reduce load on high-DPI displays
- ✅ **GPU Preference**: Uses dedicated GPU when available
- ✅ **Optimized Renderer**: Disables unused buffers (stencil) for better performance

### User Controls
- **FPS Cap Slider**: Adjust between 30-120 FPS via UI panel
- **Stats Panel**: Monitor real-time FPS and frame time
- Lower FPS = cooler laptop, longer battery life

### Why These Help
- **120 FPS → 60 FPS**: ~50% reduction in GPU/CPU usage
- **60 FPS → 30 FPS**: Another ~50% reduction (good for battery saving)
- **Tab pause**: 100% GPU savings when not viewing

