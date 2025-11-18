#!/bin/bash

# GLB Export Script
# Exports character, environment, and scene (camera + animations) as separate GLBs
# Run from project root: ./scripts/export.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "🎬 Exporting GLBs..."
echo ""

# --- Export Character ---
echo "📦 Exporting character..."
/Applications/Blender.app/Contents/MacOS/Blender --background --python "$SCRIPT_DIR/export_char.py" 2>&1 | \
  grep -v "WARNING: Animation target" | \
  grep -v "WARNING: Baking animation" | \
  grep -v "Dependency cycle detected" | \
  grep -v "Detected 5 dependency cycles" | \
  grep -v "POSE_IK_SOLVER\|BONE_DONE\|BONE_READY\|BONE_CONSTRAINTS\|BONE_POSE_PARENT" | \
  grep -v "INFO: Extracting primitive" | \
  grep -v "INFO: Primitives created" | \
  grep -v "Error: Tangent space" | \
  grep -v "Could not calculate tangents" | \
  grep -v "OBArmature_MrProBonobo"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Character export failed."
    exit 1
fi

# --- Export Environment ---
echo ""
echo "🏢 Exporting environment..."
/Applications/Blender.app/Contents/MacOS/Blender --background --python "$SCRIPT_DIR/export_env.py" 2>&1 | \
  grep -v "INFO: Extracting primitive" | \
  grep -v "INFO: Primitives created" | \
  grep -v "Error: Tangent space" | \
  grep -v "Could not calculate tangents"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Environment export failed."
    exit 1
fi

# --- Export Scene (Camera + Animations) ---
echo ""
echo "🎬 Exporting scene (camera + animations)..."
/Applications/Blender.app/Contents/MacOS/Blender --background --python "$SCRIPT_DIR/export_rt_scene.py" 2>&1 | \
  grep -v "WARNING: Animation target" | \
  grep -v "WARNING: Baking animation" | \
  grep -v "Dependency cycle detected" | \
  grep -v "Detected 5 dependency cycles" | \
  grep -v "POSE_IK_SOLVER\|BONE_DONE\|BONE_READY\|BONE_CONSTRAINTS\|BONE_POSE_PARENT" | \
  grep -v "INFO: Extracting primitive" | \
  grep -v "INFO: Primitives created" | \
  grep -v "Error: Tangent space" | \
  grep -v "Could not calculate tangents" | \
  grep -v "OBArmature_MrProBonobo"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All exports complete! Refresh your browser to see changes."
    echo ""
else
    echo ""
    echo "❌ Scene export failed."
    exit 1
fi
