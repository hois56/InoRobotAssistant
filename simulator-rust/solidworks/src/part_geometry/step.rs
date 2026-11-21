// STEP document writer adapted from CAD_Lightweight for standalone part reconstruction.
use super::Body;
use std::{fmt::Write, io};
pub(super) const ID: [f64; 12] = [1., 0., 0., 0., 0., 1., 0., 0., 0., 0., 1., 0.];
pub(super) fn name(s: &str) -> String {
    if s.bytes().all(|b| (32..127).contains(&b) && b != b'\\') {
        return s.replace('\'', "''");
    }
    let mut out = String::from("\\X2\\");
    for u in s.encode_utf16() {
        write!(out, "{u:04X}").unwrap()
    }
    out.push_str("\\X0\\");
    out
}
pub(super) fn coords(a: [f64; 3]) -> String {
    let [x, y, z] = a.map(|x| {
        let number = format!("{x:E}");
        if number.contains('.') {
            number
        } else {
            number.replacen('E', ".E", 1)
        }
    });
    format!("({x},{y},{z})")
}

#[derive(Clone, Copy)]
pub(super) struct Product {
    pd: usize,
    rep: usize,
}
pub(super) struct Writer {
    text: String,
    id: usize,
    context: usize,
    origin: usize,
}
impl Writer {
    pub fn new() -> Self {
        let mut w = Self {
            text: String::from(
                "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('CAD Lightweight'),'2;1');\nFILE_NAME('model.step','',(''),(''),'CAD Lightweight','CAD Lightweight','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n",
            ),
            id: 0,
            context: 0,
            origin: 0,
        };
        w.add("APPLICATION_CONTEXT('automotive_design')");
        w.add(
            "APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#1)",
        );
        w.add("PRODUCT_CONTEXT('',#1,'mechanical')");
        w.add("PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design')");
        w.add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))");
        w.add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))");
        w.add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
        w.add(
            "UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-5),#5,'distance_accuracy_value','')",
        );
        w.context=w.add("(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#8))GLOBAL_UNIT_ASSIGNED_CONTEXT((#5,#6,#7))REPRESENTATION_CONTEXT('','3D'))");
        w.origin = w.axis(ID);
        w
    }
    pub fn add(&mut self, body: &str) -> usize {
        self.id += 1;
        writeln!(self.text, "#{}={body};", self.id).unwrap();
        self.id
    }
    fn axis(&mut self, m: [f64; 12]) -> usize {
        let point = self.add(&format!(
            "CARTESIAN_POINT('',{})",
            coords([m[3], m[7], m[11]])
        ));
        let z = self.add(&format!("DIRECTION('',{})", coords([m[2], m[6], m[10]])));
        let x = self.add(&format!("DIRECTION('',{})", coords([m[0], m[4], m[8]])));
        self.add(&format!("AXIS2_PLACEMENT_3D('',#{point},#{z},#{x})"))
    }
    pub fn product(&mut self, label: &str, shape: Option<(&str, &[usize], usize)>) -> Product {
        let s = name(label);
        let p = self.add(&format!("PRODUCT('{s}','{s}','',(#3))"));
        let f = self.add(&format!("PRODUCT_DEFINITION_FORMATION('','',#{p})"));
        let pd = self.add(&format!("PRODUCT_DEFINITION('design','',#{f},#4)"));
        let ps = self.add(&format!("PRODUCT_DEFINITION_SHAPE('','',#{pd})"));
        let (kind, items, context) = shape.unwrap_or(("SHAPE_REPRESENTATION", &[], self.context));
        let mut list = format!("#{}", self.origin);
        for id in items {
            write!(list, ",#{id}").unwrap()
        }
        let rep = self.add(&format!("{kind}('',({list}),#{context})"));
        self.add(&format!("SHAPE_DEFINITION_REPRESENTATION(#{ps},#{rep})"));
        Product { pd, rep }
    }
    pub fn link(
        &mut self,
        parent: Product,
        child: Product,
        label: &str,
        m: [f64; 12],
    ) -> io::Result<()> {
        let det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8])
            + m[2] * (m[4] * m[9] - m[5] * m[8]);
        if (det - 1.).abs() > 1e-5 {
            return Err(io::Error::other("조립품 회전 배치를 읽지 못했습니다."));
        }
        let at = self.axis(m);
        let origin = self.origin;
        let t = self.add(&format!(
            "ITEM_DEFINED_TRANSFORMATION('','',#{origin},#{at})"
        ));
        let rel=self.add(&format!("(REPRESENTATION_RELATIONSHIP('','',#{},#{})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#{t})SHAPE_REPRESENTATION_RELATIONSHIP())",child.rep,parent.rep));
        let s = name(label);
        let occ = self.add(&format!(
            "NEXT_ASSEMBLY_USAGE_OCCURRENCE('','{s}','',#{},#{},$)",
            parent.pd, child.pd
        ));
        let def = self.add(&format!("PRODUCT_DEFINITION_SHAPE('','',#{occ})"));
        self.add(&format!(
            "CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#{rel},#{def})"
        ));
        Ok(())
    }
    pub fn append_body(
        &mut self,
        label: &str,
        body: &Body,
    ) -> io::Result<Product> {
        let base = self.id;
        let mut shape = None;
        let mut tolerance = None;
        let mut styled = Vec::new();
        for line in body.data.lines().filter(|l| l.starts_with('#')) {
            let (left, entity) = line
                .split_once('=')
                .ok_or_else(|| io::Error::other("잘못된 형상 레코드"))?;
            let id = left[1..].parse::<usize>().map_err(io::Error::other)?;
            self.id = self.id.max(base + id);
            if entity.starts_with("STYLED_ITEM(") {
                styled.push(format!("#{}", base + id));
            }
            if entity.starts_with("UNCERTAINTY_MEASURE_WITH_UNIT(") {
                tolerance = Some(base + id);
            }
            if let Some((kind, rest)) = entity.split_once("('',(") {
                if kind.ends_with("SHAPE_REPRESENTATION") && rest.ends_with("),$);") {
                    let list = rest
                        .trim_end_matches("),$);")
                        .split(',')
                        .map(|x| {
                            x.strip_prefix('#')
                                .and_then(|x| x.parse::<usize>().ok())
                                .map(|n| n + base)
                                .ok_or_else(|| io::Error::other("잘못된 형상 참조"))
                        })
                        .collect::<io::Result<Vec<_>>>()?;
                    if shape.replace((kind, list)).is_some() {
                        return Err(io::Error::other("모호한 본체 표현"));
                    }
                    continue;
                }
            }
            write!(self.text, "#{}=", base + id).unwrap();
            let bytes = entity.as_bytes();
            let mut at = 0;
            let mut quoted = false;
            let mut start = 0;
            while at < bytes.len() {
                match bytes[at] {
                    b'\'' => {
                        quoted = !quoted;
                        at += 1
                    }
                    b'#' if !quoted => {
                        self.text.push_str(&entity[start..=at]);
                        at += 1;
                        let first = at;
                        while at < bytes.len() && bytes[at].is_ascii_digit() {
                            at += 1
                        }
                        let n = entity[first..at]
                            .parse::<usize>()
                            .map_err(io::Error::other)?;
                        write!(self.text, "{}", base + n).unwrap();
                        start = at
                    }
                    _ => at += 1,
                }
            }
            self.text.push_str(&entity[start..]);
            self.text.push('\n');
        }
        let (kind, items) = shape.ok_or_else(|| io::Error::other("정밀 형상 표현이 없습니다."))?;
        let context = tolerance.map(|id| self.add(&format!("(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#{id}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#5,#6,#7))REPRESENTATION_CONTEXT('','3D'))"))).unwrap_or(self.context);
        if !styled.is_empty() {
            self.add(&format!(
                "MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',({}),#{context})",
                styled.join(",")
            ));
        }
        Ok(self.product(label, Some((kind, &items, context))))
    }
    pub fn finish(mut self) -> String {
        self.text.push_str("ENDSEC;\nEND-ISO-10303-21;\n");
        self.text
    }
}
