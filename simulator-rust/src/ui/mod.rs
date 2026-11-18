mod views;

#[link(wasm_import_module = "dom")]
extern "C" {
    fn element(name: *const u8, len: usize, svg: bool);
    fn attribute(name: *const u8, name_len: usize, value: *const u8, value_len: usize);
    fn append_text(value: *const u8, len: usize);
    fn end_element();
}

type Attributes = &'static [(&'static str, &'static str)];
type Children = &'static [Node];

pub(super) enum Node {
    Element {
        name: &'static str,
        attrs: Attributes,
        children: Children,
        svg: bool,
    },
    Text(&'static str),
}

const fn tag(name: &'static str, attrs: Attributes, children: Children) -> Node {
    Node::Element {
        name,
        attrs,
        children,
        svg: false,
    }
}
const fn svg(name: &'static str, attrs: Attributes, children: Children) -> Node {
    Node::Element {
        name,
        attrs,
        children,
        svg: true,
    }
}
const fn text(value: &'static str) -> Node {
    Node::Text(value)
}

fn render(node: &Node) {
    // All borrowed strings come from immutable view definitions. The host
    // copies them synchronously to DOM strings on the current browser thread.
    unsafe {
        match node {
            Node::Element {
                name,
                attrs,
                children,
                svg,
            } => {
                element(name.as_ptr(), name.len(), *svg);
                for (key, value) in *attrs {
                    attribute(key.as_ptr(), key.len(), value.as_ptr(), value.len());
                }
                for child in *children {
                    render(child);
                }
                end_element();
            }
            Node::Text(value) => append_text(value.as_ptr(), value.len()),
        }
    }
}

#[no_mangle]
pub extern "C" fn render_simulator() {
    for node in views::BODY {
        render(node);
    }
}
