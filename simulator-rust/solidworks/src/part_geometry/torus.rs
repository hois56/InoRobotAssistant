//! Recognize a complete circular profile encoded as two rational cubic semicircles.
//! The analytic torus avoids introducing a zero-area face at the profile seam.
use super::step::coords;
use std::collections::{HashMap, HashSet};
use std::fmt::Write;
use xt_step::Vec3;

fn refs(s: &str) -> Vec<usize> {
    s.split('#')
        .skip(1)
        .filter_map(|r| {
            r[..r.bytes().take_while(u8::is_ascii_digit).count()]
                .parse()
                .ok()
        })
        .collect()
}
fn numbers(s: &str) -> Option<Vec<f64>> {
    s.split(',').map(|x| x.parse::<f64>().ok()).collect()
}
fn triple(table: &HashMap<usize, &str>, id: usize, kind: &str) -> Option<Vec3> {
    let v = numbers(
        table
            .get(&id)?
            .strip_prefix(kind)?
            .strip_prefix("('',(")?
            .strip_suffix("));")?,
    )?;
    let [x, y, z]: [f64; 3] = v.try_into().ok()?;
    Some(Vec3::new(x, y, z))
}
fn magnitude(v: Vec3) -> f64 {
    v.dot(v).sqrt()
}
struct Torus {
    origin: Vec3,
    direction: usize,
    radial: Vec3,
    major: f64,
    minor: f64,
    reverse: bool,
}
fn recognize(table: &HashMap<usize, &str>, s: &str) -> Option<Torus> {
    let [profile, axis] = refs(s).try_into().ok()?;
    let profile = *table.get(&profile)?;
    if !profile.contains("B_SPLINE_CURVE(3,(") || !profile.contains("WITH_KNOTS((4,3,4),") {
        return None;
    }
    let weights = numbers(
        profile
            .split_once("RATIONAL_B_SPLINE_CURVE((")?
            .1
            .split_once("))")?
            .0,
    )?;
    if weights.len() != 7
        || weights[0] <= 0.
        || weights
            .iter()
            .zip([1., 1. / 3., 1. / 3., 1., 1. / 3., 1. / 3., 1.])
            .any(|(a, b)| (a / weights[0] - b).abs() > 1e-12)
    {
        return None;
    }
    let p: Vec<_> = refs(profile)
        .into_iter()
        .map(|id| triple(table, id, "CARTESIAN_POINT"))
        .collect::<Option<_>>()?;
    let [p0, p1, p2, p3, p4, p5, p6]: [Vec3; 7] = p.try_into().ok()?;
    let diameter = p0.sub(p3);
    let tangent = p1.sub(p0);
    let minor = magnitude(diameter) * 0.5;
    if minor < 1e-8
        || (magnitude(tangent) - 2. * minor).abs() > 1e-8
        || diameter.dot(tangent).abs() > 1e-8 * minor
    {
        return None;
    }
    for delta in [
        p2.sub(p3).sub(tangent),
        p4.sub(p3).add(tangent),
        p5.sub(p0).add(tangent),
        p6.sub(p0),
    ] {
        if magnitude(delta) > 1e-8 {
            return None;
        }
    }
    let [base, direction] = refs(table.get(&axis)?).try_into().ok()?;
    let base = triple(table, base, "CARTESIAN_POINT")?;
    let d = triple(table, direction, "DIRECTION")?.normalized().ok()?;
    let centre = p0.add(p3).scale(0.5);
    let origin = base.add(d.scale(centre.sub(base).dot(d)));
    let radial = centre.sub(origin);
    let major = magnitude(radial);
    let normal = diameter.cross(tangent).normalized().ok()?;
    if major <= minor || normal.dot(d).abs() > 1e-12 || normal.dot(radial).abs() > 1e-8 {
        return None;
    }
    let reverse = d.cross(p0.sub(origin)).cross(tangent).dot(diameter) < 0.;
    Some(Torus {
        origin,
        direction,
        radial: radial.normalized().ok()?,
        major,
        minor,
        reverse,
    })
}
pub(super) fn canonicalize(data: String) -> String {
    if !data.contains("=SURFACE_OF_REVOLUTION(") {
        return data;
    }
    let records = data
        .lines()
        .filter_map(|line| line.strip_prefix('#')?.split_once('='))
        .filter_map(|(id, s)| Some((id.parse::<usize>().ok()?, s)))
        .collect::<HashMap<_, _>>();
    let surfaces: HashMap<_, _> = records
        .iter()
        .filter(|(_, s)| s.starts_with("SURFACE_OF_REVOLUTION("))
        .filter_map(|(&id, s)| Some((id, recognize(&records, s)?)))
        .collect();
    if surfaces.is_empty() {
        return data;
    }
    let reverse: HashSet<usize> = surfaces
        .iter()
        .filter_map(|(&id, t)| t.reverse.then_some(id))
        .collect();
    let mut next = records.keys().max().copied().unwrap_or_default() + 1;
    let mut result = String::with_capacity(data.len());
    for line in data.lines() {
        if let Some((id, s)) = line.strip_prefix('#').and_then(|l| l.split_once('='))
            && let Ok(id) = id.parse::<usize>()
        {
            if let Some(t) = surfaces.get(&id) {
                let p = t.origin;
                let x = t.radial;
                let dir = t.direction;
                writeln!(
                    result,
                    "#{}=CARTESIAN_POINT('',{});",
                    next,
                    coords([p.x, p.y, p.z])
                )
                .unwrap();
                writeln!(
                    result,
                    "#{}=DIRECTION('',{});",
                    next + 1,
                    coords([x.x, x.y, x.z])
                )
                .unwrap();
                writeln!(
                    result,
                    "#{}=AXIS2_PLACEMENT_3D('',#{next},#{dir},#{});",
                    next + 2,
                    next + 1
                )
                .unwrap();
                writeln!(
                    result,
                    "#{id}=TOROIDAL_SURFACE('',#{},{:?},{:?});",
                    next + 2,
                    t.major,
                    t.minor
                )
                .unwrap();
                next += 3;
                continue;
            }
            if s.starts_with("ADVANCED_FACE(")
                && refs(s).last().is_some_and(|i| reverse.contains(i))
            {
                if let Some((before, flag)) = line.rsplit_once(",.") {
                    writeln!(
                        result,
                        "{before},.{}.);",
                        if flag == "T.);" { "F" } else { "T" }
                    )
                    .unwrap();
                    continue;
                }
            }
        }
        writeln!(result, "{line}").unwrap()
    }
    result
}
