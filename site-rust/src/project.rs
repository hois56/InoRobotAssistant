use crate::{OUTPUT, WORDS};

// Corresponding lines on the two sides have the same interned ID. A rolling
// LCS row and a byte per decision preserve the original insertion tie-break.
#[no_mangle]
pub extern "C" fn line_edits(left_count: usize) -> usize {
    WORDS.with_borrow(|ids| {
        OUTPUT.with_borrow_mut(|out| {
            out.clear();
            let (a, b) = ids.split_at(left_count);
            if a.len().saturating_mul(b.len()) > 4_000_000 {
                out.extend([0, a.len() as u32, 0, b.len() as u32]);
                return out.len();
            }
            let prefix = a.iter().zip(b).take_while(|(x, y)| x == y).count();
            let (a, b) = (&a[prefix..], &b[prefix..]);
            let mut directions = vec![0u8; a.len() * b.len()];
            let mut lengths = vec![0u32; b.len() + 1];
            for i in (0..a.len()).rev() {
                let mut diagonal = 0;
                for j in (0..b.len()).rev() {
                    let below = lengths[j];
                    if a[i] == b[j] {
                        lengths[j] = diagonal + 1;
                    } else if lengths[j + 1] >= below {
                        directions[i * b.len() + j] = 1;
                        lengths[j] = lengths[j + 1];
                    } else {
                        directions[i * b.len() + j] = 2;
                    }
                    diagonal = below;
                }
            }
            let (mut i, mut j) = (0, 0);
            let mut pending = None;
            let flush = |start: &mut Option<(usize, usize)>, i, j, out: &mut Vec<u32>| {
                if let Some((x, y)) = start.take() {
                    out.extend([
                        (prefix + x) as u32,
                        (prefix + i) as u32,
                        (prefix + y) as u32,
                        (prefix + j) as u32,
                    ]);
                }
            };
            while i < a.len() || j < b.len() {
                let direction = if i == a.len() {
                    1
                } else if j == b.len() {
                    2
                } else {
                    directions[i * b.len() + j]
                };
                match direction {
                    0 => {
                        flush(&mut pending, i, j, out);
                        i += 1;
                        j += 1;
                    }
                    1 => {
                        pending.get_or_insert((i, j));
                        j += 1;
                    }
                    _ => {
                        pending.get_or_insert((i, j));
                        i += 1;
                    }
                }
            }
            flush(&mut pending, i, j, out);
            out.len()
        })
    })
}
