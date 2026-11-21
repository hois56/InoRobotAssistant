//! Adapter for the unmodified XT reader and Part 21 translator from BREP_kernel 0.24.0.
//! Only the geometry library is needed when the destination already reads STEP.
pub use brep_geometry::{
    NurbsCurve, NurbsSurface, Vec3, Vec4, interpolate_curve, project_point_to_curve,
    project_point_to_surface, trimmed_curve,
};
pub mod geometry;
pub mod reader;
pub mod schema;
mod to_step;
pub use to_step::{BodyStep, body_to_step, body_face_colors};
#[derive(Debug, Clone, Copy)]
pub struct ImportedColor {
    pub r: f64,
    pub g: f64,
    pub b: f64,
}
mod step_import {
    // Cache projections during intersection-curve fitting.
    pub(crate) fn import_lean() -> bool {
        true
    }
}
