use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("main", &[("id", "main-content")], &[
    text("\n        "),
    super::canvas_container::VIEW,
    text("\n    "),
]);
