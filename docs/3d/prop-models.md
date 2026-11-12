# Prop models: making one and bringing it in

<!-- cspell:words meshopt bpy BSDF -->

How to make a 3D model for a prop outside OpenMarch (by hand in Blender, or
with an AI assistant writing a Blender script) and import it so the 3D View
draws the prop as that model. Written for people and for agents.

Decisions behind it: [props-spec.md](props-spec.md) section 2 (the import
and its review) and [ADR 0010](../adr/0010-3d-view.md) D-12 to D-19.

## The path

1. Make the model in any tool that exports glTF 2.0 (`.glb`, or `.gltf` with
   its files beside it). Blender is free and the reference here.
2. In OpenMarch, open **Props** and choose **Import a 3D model…**. The new
   prop stands at the middle of the field from the playhead's count, named
   after the file and sized to the model, and its editor opens. Move it like
   any prop.
3. The importer checks and cleans the file (below). If it can't take the
   file, the reason shows right there.
4. **View in 3D** opens the 3D View (or brings it forward) and flies the
   camera to the prop.
5. Resize the prop as usual: the model scales evenly to fit the new Outline,
   never stretched. **Replace…** swaps the model; **Remove** goes back to the
   plain block, keeping the model's size so the block stands where the model
   stood.

Once the show has a model, **Import a 3D model…** and **Replace…** list the
show's models first, so a second riser needs no file. **From a file…** opens
the picker. The props list shows which model each prop uses.

An existing prop takes a model too: in its editor, under **3D model**, choose
**Import…**. Its Outline becomes a rectangle the model's size; undo puts the
old Outline back.

The model is embedded in the show file, so the show opens anywhere with it.
Importing the same file twice stores it once.

## Conventions

| Rule                         | Why                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| Meters, real size            | A 4 × 8 ft riser is 2.44 × 0.41 × 1.22 m. The import sizes the prop from the model.   |
| +Y up, floor at y = 0        | glTF's up axis. The importer stands the lowest point on the field anyway.             |
| Front faces +Z               | +Z points at the audience on a prop at rotation 0.                                    |
| Width along X, depth along Z | X maps to the prop's width, Z to its depth.                                           |
| Origin anywhere              | The importer centers the footprint on the prop.                                       |
| Share materials              | Parts with the same material are merged into one draw. Fewer materials draw faster.   |
| Under 20,000 triangles       | Over the cap, the importer simplifies; over 80,000 it refuses the file.               |
| Textures 1024 px or less     | Bigger PNG and JPEG textures are scaled down; other formats are kept with a note.     |
| No rig, no animation         | A prop is a rigid object. A skinned mesh is refused.                                  |
| One file                     | `.glb` is simplest. A `.gltf` may only reference files in its own folder, never URLs. |

The importer also guesses fixes for common export mistakes: a model in
centimeters or inches is converted to meters, and a model whose tallest side
is Z (Z-up export) is turned to Y-up. These guesses suit props; a model made
to the rules above needs neither.

## With an AI assistant

The reliable route is to have the assistant write a Blender Python script
rather than a model file directly: the script is readable, easy to change,
and Blender does the export. Paste this as a starting prompt:

```text
Write a Blender 4.x Python script (bpy) that builds a 3D model of <describe
the prop: what it is, its real size, colors, details> and exports it as a
.glb for OpenMarch.

Rules:
- Real size in meters. Blender's Z is up; the exporter converts to glTF's
  Y-up, so build with the floor at Z = 0 and the front facing -Y in Blender
  (that becomes +Z in glTF, toward the audience).
- Width along Blender X, depth along Blender Y, height along Blender Z.
- Few materials: reuse one material for every part of the same color or
  finish. Plain colors (Principled BSDF base color, roughness, metallic)
  unless a texture is needed; textures at most 1024 px.
- Stay under 20,000 triangles. Use low segment counts on cylinders and
  bevels.
- No armature, no animation, no modifiers left unapplied.
- Start from an empty scene, name objects clearly, and end with:
  bpy.ops.export_scene.gltf(filepath="<name>.glb", export_format="GLB",
      export_apply=True, export_yup=True, export_extras=True)
```

Run it with `blender --background --python make_prop.py`, then import the
`.glb`.

## Blender by hand

- Model in meters (Scene Properties → Units: Metric, Unit Scale 1.0).
- Floor at Z = 0, front toward -Y.
- Apply transforms (Ctrl+A → All Transforms) and modifiers before export.
- File → Export → glTF 2.0: Format **glTF Binary (.glb)**, Include
  **Custom Properties**, Transform **+Y Up**, Mesh **Apply Modifiers**.

## What isn't here yet

- Artwork slots (a logo or banner on a prop that a show can swap) and
  stretch zones are read by the importer but not drawn yet.
- Equipment (held items), uniforms and flags are separate paths.
- A command-line importer for agents to check a file before handing it over.
- Models stay in the show after **Remove** or undo; a cleanup comes later.
