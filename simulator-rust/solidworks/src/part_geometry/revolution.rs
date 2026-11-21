//! A doubly closed surface of revolution has two seam edges with one shared vertex.
use super::step::coords;
use std::fmt::Write;
use xt_step::{
    Vec3,
    geometry::{Curve, curve},
    reader::{Node, XtFile},
};
struct Records {
    s: String,
    n: usize,
}
impl Records {
    fn add(&mut self, s: String) -> usize {
        self.n += 1;
        writeln!(self.s, "#{}={s};", self.n).unwrap();
        self.n
    }
    fn point(&mut self, p: Vec3) -> usize {
        self.add(format!("CARTESIAN_POINT('',{})", coords([p.x, p.y, p.z])))
    }
    fn direction(&mut self, p: Vec3) -> usize {
        self.add(format!("DIRECTION('',{})", coords([p.x, p.y, p.z])))
    }
    fn pcurve(&mut self, surface: usize, context: usize, u: f64, v: f64, along_u: bool) -> usize {
        let p = self.add(format!("CARTESIAN_POINT('',({u:?},{v:?}))"));
        let direction = if along_u { "1.,0." } else { "0.,1." };
        let d = self.add(format!("DIRECTION('',({direction}))"));
        let vec = self.add(format!("VECTOR('',#{d},1.)"));
        let line = self.add(format!("LINE('',#{p},#{vec})"));
        let rep = self.add(format!(
            "DEFINITIONAL_REPRESENTATION('',(#{line}),#{context})"
        ));
        self.add(format!("PCURVE('',#{surface},#{rep})"))
    }
}
pub(super) fn closed_profile(f: &XtFile, body: &Node) -> Option<(String, Vec<(usize, i64)>)> {
    if body.int("body_type") != Some(1) {
        return None;
    }
    let mut solid_regions = f.nodes().iter().filter(|n| {
        n.type_name() == "REGION" && n.ptr("body") == body.index && n.char("type") == Some(b'S')
    });
    let solid_region = solid_regions.next()?;
    if solid_regions.next().is_some() {
        return None;
    }
    let shell = f.follow(solid_region, "shell")?;
    let face = f.follow(shell, "face")?;
    if shell.ptr("next") != 0 || face.ptr("next") != 0 || face.ptr("loop") != 0 {
        return None;
    }
    let surf = f.follow(face, "surface")?;
    if surf.type_name() != "SPUN_SURF" {
        return None;
    }
    let profile = f.follow(surf, "profile")?;
    let Curve::Nurbs(c) = curve(f, profile).ok()? else {
        return None;
    };
    let [v0, v1] = c.domain().ok()?;
    let first = c.evaluate(v0).ok()?;
    let gap = first.sub(c.evaluate(v1).ok()?);
    if gap.dot(gap) > 1e-12 {
        return None;
    }
    let vec = |p: [f64; 3]| Vec3::new(p[0], p[1], p[2]);
    let base = vec(surf.vector("base")?).scale(1000.);
    let axis = vec(surf.vector("axis")?).normalized().ok()?;
    let centre = base.add(axis.scale(first.sub(base).dot(axis)));
    let radial = first.sub(centre);
    let radius = radial.dot(radial).sqrt();
    if radius < 1e-9 {
        return None;
    }
    let mut w = Records {
        s: String::new(),
        n: 0,
    };
    let mut poles = Vec::new();
    let mut weights = Vec::new();
    for p in &c.control_points {
        if p.w <= 0. {
            return None;
        }
        poles.push(format!(
            "#{}",
            w.point(Vec3::new(p.x / p.w, p.y / p.w, p.z / p.w))
        ));
        weights.push(format!("{:?}", p.w));
    }
    let mut knots: Vec<f64> = Vec::new();
    let mut mult: Vec<usize> = Vec::new();
    for &k in &c.knots {
        if knots.last() == Some(&k) {
            *mult.last_mut()? += 1
        } else {
            knots.push(k);
            mult.push(1)
        }
    }
    let curve=w.add(format!("(BOUNDED_CURVE()B_SPLINE_CURVE({},({}),.UNSPECIFIED.,.T.,.F.)B_SPLINE_CURVE_WITH_KNOTS(({}),({}),.UNSPECIFIED.)CURVE()GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_CURVE(({}))REPRESENTATION_ITEM(''))",c.degree,poles.join(","),mult.iter().map(usize::to_string).collect::<Vec<_>>().join(","),knots.iter().map(|x|format!("{x:?}")).collect::<Vec<_>>().join(","),weights.join(",")));
    let p = w.point(base);
    let z = w.direction(axis);
    let spin = w.add(format!("AXIS1_PLACEMENT('',#{p},#{z})"));
    let surface = w.add(format!("SURFACE_OF_REVOLUTION('',#{curve},#{spin})"));
    let p = w.point(centre);
    let x = w.direction(radial.normalized().ok()?);
    let a = w.add(format!("AXIS2_PLACEMENT_3D('',#{p},#{z},#{x})"));
    let circle = w.add(format!("CIRCLE('',#{a},{radius:?})"));
    let p = w.point(first);
    let vertex = w.add(format!("VERTEX_POINT('',#{p})"));
    let ctx=w.add("(GEOMETRIC_REPRESENTATION_CONTEXT(2)PARAMETRIC_REPRESENTATION_CONTEXT()REPRESENTATION_CONTEXT('2D',''))".into());
    let mut edges = Vec::new();
    for (g, u, v, horiz) in [
        (curve, std::f64::consts::TAU, v0, false),
        (circle, 0., v1, true),
    ] {
        let a = w.pcurve(surface, ctx, 0., v0, horiz);
        let b = w.pcurve(surface, ctx, u, v, horiz);
        let seam = w.add(format!("SEAM_CURVE('',#{g},(#{a},#{b}),.PCURVE_S1.)"));
        edges.push(w.add(format!("EDGE_CURVE('',#{vertex},#{vertex},#{seam},.T.)")));
    }
    let mut oriented = Vec::new();
    for (edge, sense) in [
        (edges[0], "F"),
        (edges[1], "T"),
        (edges[0], "T"),
        (edges[1], "F"),
    ] {
        oriented.push(format!(
            "#{}",
            w.add(format!("ORIENTED_EDGE('',*,*,#{edge},.{sense}.)"))
        ));
    }
    let lp = w.add(format!("EDGE_LOOP('',({}))", oriented.join(",")));
    let bound = w.add(format!("FACE_BOUND('',#{lp},.F.)"));
    let same = if face.char("sense") == surf.char("sense") {
        "F"
    } else {
        "T"
    };
    let persistent = face.int("node_id")?;
    let face = w.add(format!("ADVANCED_FACE('',(#{bound}),#{surface},.{same}.)"));
    let shell = w.add(format!("CLOSED_SHELL('',(#{face}))"));
    let item = w.add(format!("MANIFOLD_SOLID_BREP('',#{shell})"));
    w.add(format!(
        "ADVANCED_BREP_SHAPE_REPRESENTATION('',(#{item}),$)"
    ));
    Some((w.s, vec![(face, persistent)]))
}
