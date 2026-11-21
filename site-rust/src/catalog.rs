use crate::{BYTES, OUTPUT, WORDS};
use std::cell::RefCell;
use std::ops::Range;

// Each row lists the option IDs it satisfies. Options are grouped, so multiple
// selections in one group are alternatives. A product can satisfy both clean
// body options. The size of a category is independent of the machine word size.
#[derive(Default)]
struct Catalog {
    groups: Vec<u32>,
    group_count: usize,
    rows: Vec<Vec<u32>>,
    text: String,
    fields: Vec<Vec<Range<usize>>>,
}

thread_local! {
    static CATALOGS: RefCell<Vec<Catalog>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn catalog_init(options: usize, groups: usize) -> usize {
    WORDS.with_borrow(|data| {
        let (categories, mut records) = data.split_at(options);
        let mut rows = Vec::new();
        while let Some((&len, rest)) = records.split_first() {
            let (row, next) = rest.split_at(len as usize);
            rows.push(row.to_vec());
            records = next;
        }
        CATALOGS.with_borrow_mut(|catalogs| {
            catalogs.push(Catalog {
                groups: categories.to_vec(),
                group_count: groups,
                rows,
                ..Catalog::default()
            });
            catalogs.len() - 1
        })
    })
}

#[no_mangle]
pub extern "C" fn catalog_text(id: usize) {
    CATALOGS.with_borrow_mut(|catalogs| {
        let c = &mut catalogs[id];
        BYTES.with_borrow(|bytes| {
            c.text.clear();
            c.text.push_str(std::str::from_utf8(bytes).unwrap());
        });
        WORDS.with_borrow(|lengths| {
            let mut offset = 0;
            let mut lengths = lengths.iter();
            c.fields = (0..c.rows.len())
                .map(|_| {
                    let count = *lengths.next().unwrap() as usize;
                    lengths
                        .by_ref()
                        .take(count)
                        .map(|&len| {
                            let start = offset;
                            offset += len as usize;
                            start..offset
                        })
                        .collect()
                })
                .collect();
        });
    });
}

#[no_mangle]
pub extern "C" fn catalog_query(id: usize) -> usize {
    CATALOGS.with_borrow(|catalogs| {
        let c = &catalogs[id];
        WORDS.with_borrow(|selected| {
            BYTES.with_borrow(|query| {
                let query = std::str::from_utf8(query).unwrap();
                OUTPUT.with_borrow_mut(|out| {
                    out.clear();
                    out.resize(c.groups.len(), 0); // availability, followed by matching row indices
                    let mut active = vec![false; c.group_count];
                    for (i, &flag) in selected.iter().enumerate() {
                        if flag != 0 {
                            active[c.groups[i] as usize] = true;
                        }
                    }
                    let mut satisfied = vec![false; c.group_count];
                    for (index, row) in c.rows.iter().enumerate() {
                        if !query.is_empty()
                            && !c.fields[index]
                                .iter()
                                .any(|r| c.text[r.clone()].contains(query))
                        {
                            continue;
                        }
                        satisfied.fill(false);
                        for &option in row {
                            if selected[option as usize] != 0 {
                                satisfied[c.groups[option as usize] as usize] = true;
                            }
                        }
                        let mut missing = active
                            .iter()
                            .zip(&satisfied)
                            .enumerate()
                            .filter(|(_, (&needed, &met))| needed && !met)
                            .map(|(i, _)| i);
                        let first = missing.next();
                        if missing.next().is_some() {
                            continue;
                        }
                        if first.is_none() {
                            out.push(index as u32);
                        }
                        for &option in row {
                            if first.is_none() || first == Some(c.groups[option as usize] as usize)
                            {
                                out[option as usize] = 1;
                            }
                        }
                    }
                    out.len()
                })
            })
        })
    })
}
