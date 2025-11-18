# Quick Start: Export Your RT_SCENE

## ✅ Everything is Ready!

Your export script is configured and ready to use with your actual file paths:

### Your Files (on Google Drive):
- ✅ **RT_SCENE**: `RT_SCENE_ApeEscape_MASTER.blend` (7.3 MB)
- ✅ **Character**: `CHAR_MrProBonobo_MASTER.blend` (10.4 MB)
- ✅ **Environment**: `ENV_ApeEscapeOffice_MASTER.blend` (115.4 MB)

### Export Location:
- 📦 **Output**: `/Users/amaro/Documents/dev/based.guide_realtime/public/RT_SCENE_ApeEscape.glb`

---

## 🚀 To Export (One Command!)

**⚠️ IMPORTANT: Close Blender before running the export!**

The script runs Blender in background mode, so you cannot have Blender open.

```bash
cd /Users/amaro/Documents/dev/based.guide_realtime
./export.sh
```

That's it! The script will:
1. Read `RT_SCENE_ApeEscape_MASTER.blend` from Google Drive
2. Find all linked collections (character + environment)
3. Export everything to `public/RT_SCENE_ApeEscape.glb`
4. Tell you what was exported

---

## 📋 What the Script Will Show

You should see output like:

```
============================================================
RT_SCENE Export Script
============================================================

1. Loading RT_SCENE: /Users/amaro/Library/.../RT_SCENE_ApeEscape_MASTER.blend

2. Processing linked data...
   Found X linked objects
      - [Character objects]
      - [Environment objects]
   
   Making local for export (temporary, doesn't modify source files)...
   ✓ Linked data now exportable

3. Verifying scene contents...
   - SkinnedMeshes (character): X     ← Should be > 0!
   - Cameras: 1
   - Armatures (rigs): 1
   - Total meshes: 200+
   - Animations: 2+

5. Exporting to: .../public/RT_SCENE_ApeEscape.glb
   ✓ Export successful!

============================================================
✓ Export Complete!
============================================================

GLB file: /Users/.../public/RT_SCENE_ApeEscape.glb
File size: XX.XX MB

📊 Exported:
   - XXX objects
   - X skinned meshes (character)
   - 1 cameras
   - 2+ animations

🔄 Next: Refresh your browser to see the updated scene.
============================================================
```

---

## ⚠️ Important Checks

### Before First Export

Make sure your `RT_SCENE_ApeEscape_MASTER.blend` has:

1. **Linked Character Collection:**
   - File → Link → Navigate to:
     `/Users/amaro/Library/.../characters/MrProBonobo/CHAR_MrProBonobo_MASTER.blend`
   - Select the character collection
   - **Keep as link!** (Don't make local)

2. **Linked Environment Collection:**
   - File → Link → Navigate to:
     `/Users/amaro/Library/.../environments/ApeEscapeOffice/ENV_ApeEscapeOffice_MASTER.blend`
   - Select the environment collection
   - **Keep as link!** (Don't make local)

3. **Camera in Scene:**
   - Position it where you want the Three.js camera to start
   - Camera will be exported and used in the web viewer

4. **Animations:**
   - Either on timeline or in NLA strips
   - Make sure they're assigned to the character armature

---

## 🎯 After Export

1. **Check Console Output:**
   - "SkinnedMeshes (character): X" should be > 0
   - If it's 0, the character isn't linked properly in RT_SCENE

2. **Refresh Browser:**
   - Open/refresh http://localhost:5173
   - Check browser console for:
     ```
     ✓ Camera found
     ✓ Character found (X SkinnedMeshes)
     ✓ Animations loaded
     ```

3. **See Your Scene:**
   - Camera positioned from Blender
   - Character animating
   - Environment visible
   - Use mouse to orbit/zoom

---

## 🔄 Daily Workflow

```bash
# 1. Edit your 3D files in Blender (on Google Drive)
#    - CHAR_MrProBonobo_MASTER.blend
#    - ENV_ApeEscapeOffice_MASTER.blend  
#    - RT_SCENE_ApeEscape_MASTER.blend
#    Save and CLOSE Blender

# 2. Export (from your web project folder)
cd /Users/amaro/Documents/dev/based.guide_realtime
./export.sh

# 3. View
#    Refresh browser → Done!
```

**Note:** The export script runs Blender in headless/background mode, so Blender cannot be open when you run it.

**No manual steps. No "remember to do X, Y, Z." Just edit → export → refresh!** 🎉

---

## 🐛 Troubleshooting

### "No linked objects found"
→ Your RT_SCENE doesn't have linked collections. Link them as described above.

### "SkinnedMeshes: 0"
→ Character either not linked, or doesn't have armature modifier.

### "RT_SCENE file not found"
→ Check the path in `export_rt_scene.py` line 7. Make sure Google Drive is synced.

### Export takes a long time
→ Normal for first export. Subsequent exports are faster.

### "Blender command not found"
→ Update Blender path in `export.sh` line 8.

---

## 📚 More Info

- **Full workflow guide**: `README_WORKFLOW.md`
- **Detailed setup**: `PROPER_LINKED_WORKFLOW.md`
- **Current issues/fixes**: `CURRENT_ISSUES.md`

---

## Ready to Go!

Your export script is configured with your actual file paths. Just run:

```bash
./export.sh
```

And your character + environment + camera + animations will be exported to the web project! 🚀

