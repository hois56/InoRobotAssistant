use super::{ascii, boolean_literal, compare_literals, condition_error, whitespace, SOURCE};
use std::ops::Range;

struct Condition<'a>(&'a [u16]);
impl Condition<'_> {
    fn trim(&self, mut r: Range<usize>) -> Range<usize> {
        while r.start < r.end && whitespace(self.0[r.start]) {
            r.start += 1;
        }
        while r.start < r.end && whitespace(self.0[r.end - 1]) {
            r.end -= 1;
        }
        r
    }
    fn word(c: u16) -> bool {
        let c = ascii(c);
        c.is_ascii_alphanumeric() || c == b'_'
    }
    fn matches(&self, pos: usize, end: usize, needle: &[u8]) -> bool {
        pos + needle.len() <= end
            && needle
                .iter()
                .enumerate()
                .all(|(i, c)| ascii(self.0[pos + i]).eq_ignore_ascii_case(c))
    }
    // Return positions outside quotes and nested parentheses/register indices.
    fn top_level(&self, r: Range<usize>) -> Vec<usize> {
        let mut result = Vec::new();
        let mut depth = 0i32;
        let mut quote = None;
        let mut i = r.start;
        while i < r.end {
            let c = ascii(self.0[i]);
            if let Some(q) = quote {
                if c == b'\\' {
                    i += 1;
                } else if c == q {
                    quote = None;
                }
            } else {
                match c {
                    b'\'' | b'"' => quote = Some(c),
                    b'(' | b'[' => depth += 1,
                    b')' | b']' => depth -= 1,
                    _ if depth == 0 => result.push(i),
                    _ => (),
                }
            }
            i += 1;
        }
        result
    }
    fn wrapped(&self, r: &Range<usize>) -> bool {
        if r.len() < 2 || self.0[r.start] != 40 || self.0[r.end - 1] != 41 {
            return false;
        }
        let mut i = r.start;
        let mut depth = 0;
        let mut quote = None;
        while i < r.end {
            let c = ascii(self.0[i]);
            if let Some(q) = quote {
                if c == b'\\' {
                    i += 1;
                } else if c == q {
                    quote = None;
                }
            } else {
                match c {
                    b'\'' | b'"' => quote = Some(c),
                    b'(' => depth += 1,
                    b')' => {
                        depth -= 1;
                        if depth == 0 {
                            return i + 1 == r.end;
                        }
                    }
                    _ => (),
                }
            }
            i += 1;
        }
        false
    }
    fn evaluate(&self, range: Range<usize>) -> Result<bool, (i32, Range<usize>)> {
        let mut r = self.trim(range);
        if !r.is_empty() && self.0[r.end - 1] == 59 {
            r.end -= 1;
            r = self.trim(r);
        }
        if r.len() >= 4
            && self.matches(r.end - 4, r.end, b"then")
            && (r.len() == 4 || !Self::word(self.0[r.end - 5]))
        {
            r.end -= 4;
            r = self.trim(r);
        }
        if r.is_empty() {
            return Err((0, r));
        }
        if self.wrapped(&r) {
            loop {
                r = self.trim(r.start + 1..r.end - 1);
                if !self.wrapped(&r) { break; }
            }
            return self.evaluate(r);
        }
        let positions = self.top_level(r.clone());
        for (word, stop) in [(b"or".as_slice(), true), (b"and".as_slice(), false)] {
            let mut start = r.start;
            for &i in &positions {
                if i < start
                    || !self.matches(i, r.end, word)
                    || i > r.start && Self::word(self.0[i - 1])
                    || i + word.len() < r.end && Self::word(self.0[i + word.len()])
                {
                    continue;
                }
                if self.evaluate(start..i)? == stop {
                    return Ok(stop);
                }
                start = i + word.len();
            }
            if start != r.start {
                return self.evaluate(start..r.end);
            }
        }
        if r.len() > 4 && self.matches(r.start, r.end, b"not") && whitespace(self.0[r.start + 3]) {
            return Ok(!self.evaluate(r.start + 4..r.end)?);
        }
        if r.len() > 1 && self.0[r.start] == 33 {
            return Ok(!self.evaluate(r.start + 1..r.end)?);
        }
        for i in positions {
            for (op, id) in [
                (b"==".as_slice(), 0),
                (b"!=", 1),
                (b"<>", 1),
                (b">=", 2),
                (b"<=", 3),
                (b"=", 0),
                (b">", 4),
                (b"<", 5),
            ] {
                if !self.matches(i, r.end, op) {
                    continue;
                }
                let a = self.trim(r.start..i);
                let b = self.trim(i + op.len()..r.end);
                if a.is_empty() || b.is_empty() {
                    return Err((1, r));
                }
                return Ok(unsafe { compare_literals(id, a.start, a.end, b.start, b.end) });
            }
        }
        Ok(unsafe { boolean_literal(r.start, r.end) })
    }
}

#[no_mangle]
pub extern "C" fn olp_condition() -> bool {
    let source = SOURCE.with_borrow_mut(std::mem::take);
    match Condition(&source).evaluate(0..source.len()) {
        Ok(result) => result,
        Err((kind, r)) => {
            unsafe {
                condition_error(kind, r.start, r.end);
            }
            false
        }
    }
}
