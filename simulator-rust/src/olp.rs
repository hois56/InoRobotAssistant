use std::cell::RefCell;

// The host owns robot registers, typed JS values and synchronous robot
// builtins. Rust owns tokenization, precedence, evaluation order and arithmetic.
#[link(wasm_import_module = "olp")]
extern "C" {
    fn numeric(value: f64) -> u32;
    fn numeric_value(handle: u32) -> f64;
    fn literal(start: u32, end: u32, quoted: bool) -> u32;
    fn symbol(start: u32, end: u32) -> u32;
    fn builtin(start: u32, end: u32, arguments: *const u32, count: u32) -> u32;
    fn string_operand(left: u32, right: u32) -> bool;
    fn concatenate(left: u32, right: u32) -> u32;
}

thread_local! {static SOURCE:RefCell<Vec<u16>>=const {RefCell::new(Vec::new())};}
#[no_mangle]
pub extern "C" fn olp_source(len: usize) -> *mut u16 {
    SOURCE.with_borrow_mut(|s| {
        s.resize(len, 0);
        s.as_mut_ptr()
    })
}
#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Number,
    Text,
    Symbol,
    Op(u8),
}
#[derive(Clone, Copy)]
struct Token {
    kind: Kind,
    start: u32,
    end: u32,
}
fn ascii(ch: u16) -> u8 {
    u8::try_from(ch).unwrap_or(0)
}
fn is_identifier(c: u8) -> bool {
    c.is_ascii_alphabetic() || c == b'_'
}
fn whitespace(c: u16) -> bool {
    matches!(c,9..=13|32|160|0x1680|0x2000..=0x200a|0x2028|0x2029|0x202f|0x205f|0x3000|0xfeff)
}
fn lex(source: &[u16]) -> Option<Vec<Token>> {
    let mut i = 0;
    let mut tokens = Vec::new();
    let at = |n: usize| source.get(n).copied().map(ascii).unwrap_or(0);
    while i < source.len() {
        if whitespace(source[i]) {
            i += 1;
            continue;
        }
        let start = i;
        let c = at(i);
        let kind = if c.is_ascii_digit() || (c == b'.' && at(i + 1).is_ascii_digit()) {
            while at(i).is_ascii_digit() {
                i += 1;
            }
            if at(i) == b'.' {
                i += 1;
                while at(i).is_ascii_digit() {
                    i += 1;
                }
            }
            if matches!(at(i), b'e' | b'E') {
                let mut j = i + 1;
                if matches!(at(j), b'+' | b'-') {
                    j += 1;
                }
                if at(j).is_ascii_digit() {
                    i = j + 1;
                    while at(i).is_ascii_digit() {
                        i += 1;
                    }
                }
            }
            Kind::Number
        } else if c == b'\'' || c == b'"' {
            i += 1;
            while i < source.len() && at(i) != c {
                if at(i) == b'\\' && i + 1 < source.len() {
                    i += 1;
                }
                i += 1;
            }
            if i == source.len() {
                return None;
            }
            i += 1;
            Kind::Text
        } else if is_identifier(c) {
            i += 1;
            loop {
                while is_identifier(at(i)) || at(i).is_ascii_digit() {
                    i += 1;
                }
                while at(i) == b'[' {
                    let mut depth = 1;
                    i += 1;
                    while i < source.len() && depth > 0 {
                        match at(i) {
                            b'[' => depth += 1,
                            b']' => depth -= 1,
                            _ => {}
                        }
                        i += 1;
                    }
                }
                if at(i) == b'.' && is_identifier(at(i + 1)) {
                    i += 2;
                } else {
                    break;
                }
            }
            Kind::Symbol
        } else if b"+-*/(),".contains(&c) {
            i += 1;
            Kind::Op(c)
        } else {
            return None;
        };
        tokens.push(Token {
            kind,
            start: start as u32,
            end: i as u32,
        });
    }
    Some(tokens)
}
type Value = Result<u32, i32>;
fn handle(id: u32) -> Value {
    if id == 0 {
        Err(0)
    } else {
        Ok(id)
    }
}
struct Parser<'a> {
    source: &'a [u16],
    tokens: &'a [Token],
    at: usize,
}
impl Parser<'_> {
    fn accept(&mut self, op: u8) -> bool {
        if self
            .tokens
            .get(self.at)
            .is_some_and(|t| t.kind == Kind::Op(op))
        {
            self.at += 1;
            true
        } else {
            false
        }
    }
    fn primary(&mut self) -> Value {
        let Some(token) = self.tokens.get(self.at).copied() else {
            return Err(-1);
        };
        self.at += 1;
        match token.kind {
            Kind::Number | Kind::Text => {
                handle(unsafe { literal(token.start, token.end, token.kind == Kind::Text) })
            }
            Kind::Op(b'(') => {
                let value = self.add()?;
                if self.accept(b')') {
                    Ok(value)
                } else {
                    Err(-2)
                }
            }
            Kind::Symbol if self.accept(b'(') => {
                let mut arguments = Vec::new();
                if !self.accept(b')') {
                    loop {
                        let start = self.tokens.get(self.at).map_or(0, |t| t.start);
                        let value = self.add()?;
                        arguments.extend([value, start, self.tokens[self.at - 1].end]);
                        if !self.accept(b',') {
                            break;
                        }
                    }
                    if !self.accept(b')') {
                        return Err(-3);
                    }
                }
                handle(unsafe {
                    builtin(
                        token.start,
                        token.end,
                        arguments.as_ptr(),
                        (arguments.len() / 3) as u32,
                    )
                })
            }
            Kind::Symbol => {
                let text = &self.source[token.start as usize..token.end as usize];
                let equals = |s: &[u8]| {
                    text.len() == s.len()
                        && text
                            .iter()
                            .zip(s)
                            .all(|(&c, &b)| ascii(c).to_ascii_uppercase() == b)
                };
                if equals(b"ON") || equals(b"TRUE") {
                    handle(unsafe { numeric(1.) })
                } else if equals(b"OFF") || equals(b"FALSE") {
                    handle(unsafe { numeric(0.) })
                } else {
                    handle(unsafe { symbol(token.start, token.end) })
                }
            }
            _ => Err(-1),
        }
    }
    fn unary(&mut self) -> Value {
        let mut coerce = false;
        let mut negative = false;
        while let Some(Token {
            kind: Kind::Op(sign @ (b'+' | b'-')),
            ..
        }) = self.tokens.get(self.at)
        {
            negative ^= *sign == b'-';
            coerce = true;
            self.at += 1;
        }
        let value = self.primary()?;
        if coerce {
            let n = unsafe { numeric_value(value) };
            handle(unsafe { numeric(if negative { -n } else { n }) })
        } else {
            Ok(value)
        }
    }
    fn product(&mut self) -> Value {
        let mut value = self.unary()?;
        loop {
            let divide = if self.accept(b'*') {
                false
            } else if self.accept(b'/') {
                true
            } else {
                break;
            };
            let right = unsafe { numeric_value(self.unary()?) };
            if divide && right == 0. {
                return Err(-4);
            }
            let left = unsafe { numeric_value(value) };
            value = handle(unsafe { numeric(if divide { left / right } else { left * right }) })?;
        }
        Ok(value)
    }
    fn add(&mut self) -> Value {
        let mut value = self.product()?;
        loop {
            let add = if self.accept(b'+') {
                true
            } else if self.accept(b'-') {
                false
            } else {
                break;
            };
            let right = self.product()?;
            if add && unsafe { string_operand(value, right) } {
                value = handle(unsafe { concatenate(value, right) })?;
            } else {
                let a = unsafe { numeric_value(value) };
                let b = unsafe { numeric_value(right) };
                value = handle(unsafe { numeric(if add { a + b } else { a - b }) })?;
            }
        }
        Ok(value)
    }
}
#[no_mangle]
pub extern "C" fn olp_eval() -> i32 {
    // Evaluating a builtin or an indexed register may enter another expression.
    // A local source owns its references until the synchronous call completes.
    let source = SOURCE.with_borrow_mut(std::mem::take);
    let Some(tokens) = lex(&source) else {
        return 0;
    };
    if tokens.is_empty() {
        return 0;
    }
    let mut parser = Parser {
        source: &source,
        tokens: &tokens,
        at: 0,
    };
    match parser.add() {
        Ok(v) if parser.at == tokens.len() => v as i32,
        Ok(_) => 0,
        Err(status) => status,
    }
}
