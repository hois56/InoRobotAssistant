# Generated URDF files

Generated from the 29 controller configuration JSON files in ../새 폴더 and the simulation kinematic catalog in ../models/models.json.

- Meshes are referenced from ../models/<folder>/*.stl and scaled from millimetres to metres.
- Revolute limits and velocities are converted from degrees to radians.
- SCARA J3 is exported as a prismatic joint using its screw lead.
- Link mass, centre of gravity, inertia, and payload metadata come from the controller JSON.
- If a source inertia tensor is not positive-definite or a source mesh is absent, the generator uses a bounding-box inertia fallback and marks it in the URDF comment.
- The controller JSON inertia field contains model-specific unit/ordering quirks; validate the generated inertial frames before using Gazebo or another dynamics engine for quantitative results.

Generated files: 29
