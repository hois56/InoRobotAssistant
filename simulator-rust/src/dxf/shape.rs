use super::records::{number, Fields, Record};
use crate::cad::{arc_points, polyline, Point};
use serde_json::{json, Value};
use std::f64::consts::TAU;
mod text;

pub(super) struct Shape {
    pub geometry: Value,
    pub points: Vec<Point>,
    pub closed: Option<bool>,
    pub display: Option<&'static str>,
    pub copy_points: bool,
    pub infinite_line: bool,
}
impl Shape {
    fn new(geometry: Value, points: Vec<Point>) -> Self {
        Self {
            geometry,
            points,
            closed: None,
            display: None,
            copy_points: false,
            infinite_line: false,
        }
    }
}
pub(super) fn shape(rec: &Record, segments: f64) -> Option<Shape> {
    let f = rec.fields;
    let origin = f.point(10, 20, [0.; 2]);
    let mut s = match rec.kind.as_str() {
        "LINE" => {
            let end = f.point(11, 21, origin);
            Shape::new(
                json!({"kind":"line","start":origin,"end":end}),
                vec![origin, end],
            )
        }
        "CIRCLE" | "ARC" => {
            let circle = rec.kind == "CIRCLE";
            let radius = f.num(40, 0.).abs();
            let (start, end) = if circle {
                (0., TAU)
            } else {
                (f.num(50, 0.).to_radians(), f.num(51, 0.).to_radians())
            };
            let points = arc_points(
                origin,
                [radius.max(1e-6), 0.],
                1.,
                start,
                end,
                segments,
                false,
            );
            if circle {
                let mut s = Shape::new(
                    json!({"kind":"circle","center":origin,"radius":radius,"closed":true}),
                    points,
                );
                s.closed = Some(true);
                s.copy_points = true;
                s
            } else {
                Shape::new(
                    json!({"kind":"arc","center":origin,"radius":radius,"startAngle":start,"endAngle":end}),
                    points,
                )
            }
        }
        "ELLIPSE" => {
            let major = f.point(11, 21, [0.; 2]);
            let ratio = f.num(40, 0.).abs();
            let ratio = if ratio == 0. { 1. } else { ratio };
            let start = f.num(41, 0.);
            let end = f.num(42, 0.);
            let end = if end == 0. { TAU } else { end };
            let closed = (end - start).abs() >= TAU - 1e-5;
            let points = arc_points(origin, major, ratio, start, end, segments, true);
            let mut s = Shape::new(
                json!({"kind":"ellipse","center":origin,"majorAxis":major,"ratio":ratio,
                "startParam":start,"endParam":end,"closed":closed}),
                points,
            );
            s.closed = Some(closed);
            s
        }
        "LWPOLYLINE" | "POLYLINE" => {
            let lw = rec.kind == "LWPOLYLINE";
            let mut lw_vertices: Vec<(Point, f64)> = vec![];
            if lw {
                for item in f {
                    match item.code {
                        10 => lw_vertices.push(([number(item.value, 0.), 0.], 0.)),
                        20 => {
                            if let Some(last) = lw_vertices.last_mut() {
                                last.0[1] = number(item.value, 0.);
                            }
                        }
                        42 => {
                            if let Some(last) = lw_vertices.last_mut() {
                                last.1 = number(item.value, 0.);
                            }
                        }
                        _ => (),
                    }
                }
            }
            let vertices = if lw { &lw_vertices } else { &rec.vertices };
            let closed = (f.num(70, 0.).trunc() % 2.).abs() == 1.;
            let points = polyline(vertices, closed, (segments / 4.).ceil().max(8.));
            let vertices: Vec<_> = vertices
                .iter()
                .map(|(point, bulge)| json!({"point":point,"bulge":bulge}))
                .collect();
            let mut s = Shape::new(
                json!({"kind":"polyline","vertices":vertices,"closed":closed,"elevation":f.num(if lw{38}else{30},0.)}),
                points,
            );
            s.closed = Some(closed);
            s.copy_points = true;
            s
        }
        "POINT" => Shape::new(json!({"kind":"point","point":origin}), vec![origin]),
        "RAY" | "XLINE" => {
            let dir = f.point(11, 21, [1., 0.]);
            let m = dir[0].hypot(dir[1]);
            let m = if m == 0. { 1. } else { m };
            let end = [
                origin[0] + dir[0] / m * 10000.,
                origin[1] + dir[1] / m * 10000.,
            ];
            let mut s = Shape::new(
                json!({"kind":rec.kind.to_lowercase(),"origin":origin,"direction":dir}),
                vec![origin, end],
            );
            s.infinite_line = true;
            s
        }
        "TEXT" | "MTEXT" => text::parse(rec)?,
        _ => return None,
    };
    if rec.kind == "POINT" {
        s.display = Some("point");
    }
    Some(s)
}

#[derive(Clone, Copy)]
pub(super) struct Transform {
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    x: f64,
    y: f64,
}
impl Transform {
    pub fn insert(record: &Record, base: Point) -> Self {
        let f = record.fields;
        let (sin, cos) = f.num(50, 0.).to_radians().sin_cos();
        let (sx, sy) = (f.num(41, 1.), f.num(42, 1.));
        let (a, b, c, d) = (cos * sx, sin * sx, -sin * sy, cos * sy);
        Self {
            a,
            b,
            c,
            d,
            x: f.num(10, 0.) - (a * base[0] + c * base[1]),
            y: f.num(20, 0.) - (b * base[0] + d * base[1]),
        }
    }
    fn vector(&self, [x, y]: Point) -> Point {
        [self.a * x + self.c * y, self.b * x + self.d * y]
    }
    fn point(&self, p: Point) -> Point {
        let [x, y] = self.vector(p);
        [x + self.x, y + self.y]
    }
    pub fn compose(self, r: Self) -> Self {
        let [a, b] = self.vector([r.a, r.b]);
        let [c, d] = self.vector([r.c, r.d]);
        let [x, y] = self.point([r.x, r.y]);
        Self { a, b, c, d, x, y }
    }
    pub fn apply(&self, s: &mut Shape) {
        for p in &mut s.points {
            *p = self.point(*p);
        }
        let g = &mut s.geometry;
        for key in [
            "start",
            "end",
            "center",
            "point",
            "insertionPoint",
            "alignmentPoint",
            "majorAxis",
            "direction",
        ] {
            if let Some(p) = g.get_mut(key) {
                if let (Some(x), Some(y)) = (p[0].as_f64(), p[1].as_f64()) {
                    *p = json!(if matches!(key, "majorAxis" | "direction") {
                        self.vector([x, y])
                    } else {
                        self.point([x, y])
                    });
                }
            }
        }
        if let Some(vertices) = g.get_mut("vertices").and_then(Value::as_array_mut) {
            for v in vertices {
                let p = &v["point"];
                v["point"] =
                    json!(self.point([p[0].as_f64().unwrap_or(0.), p[1].as_f64().unwrap_or(0.)]));
            }
        }
        let sx = self.a.hypot(self.b);
        let sy = self.c.hypot(self.d);
        if let Some(radius) = g["radius"].as_f64() {
            if (sx - sy).abs() <= 1e-7 {
                g["radius"] = json!((radius * sx).abs());
            }
        }
        if g["kind"] == "text" {
            let (sin, cos) = g["rotation"].as_f64().unwrap_or(0.).sin_cos();
            let [xx, xy] = self.vector([cos, sin]);
            let [yx, yy] = self.vector([-sin, cos]);
            let positive = |n: f64| if n == 0. { 1. } else { n };
            let (w, h) = (positive(xx.hypot(xy)), positive(yx.hypot(yy)));
            g["rotation"] = json!(xy.atan2(xx));
            for (key, scale) in [
                ("height", h),
                ("textHeight", h),
                ("textWidth", w),
                ("referenceWidth", w),
            ] {
                if let Some(n) = g[key].as_f64() {
                    g[key] = json!((n * scale).abs());
                }
            }
            g["anchorOffset"] = json!([
                g["anchorOffset"][0].as_f64().unwrap_or(0.) * w,
                g["anchorOffset"][1].as_f64().unwrap_or(0.) * h
            ]);
        }
        if g.get("elevation").is_some() {
            g["elevation"] = json!(0);
        }
    }
}
