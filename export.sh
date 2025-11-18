#!/bin/bash

# RT_SCENE GLB Export Script
# Exports character and scene as separate GLBs

echo ""
echo "🎬 Exporting GLBs..."
echo ""

# Export character first
echo "📦 Exporting character..."
/Applications/Blender.app/Contents/MacOS/Blender --background --python export_char.py 2>&1 | \
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
    echo "❌ Character export failed. Check the output above for errors."
    echo ""
    exit 1
fi

echo ""
echo "🏢 Exporting scene..."
/Applications/Blender.app/Contents/MacOS/Blender --background --python export_rt_scene.py 2>&1 | \
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
    echo "✅ Export complete! Refresh your browser to see changes."
    echo ""
else
    echo ""
    echo "❌ Scene export failed. Check the output above for errors."
    echo ""
    exit 1
fi
