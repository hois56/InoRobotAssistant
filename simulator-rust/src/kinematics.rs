use crate::with_buffer;

type Matrix = [f64; 9];

pub(crate) fn multiply(left: Matrix, right: Matrix) -> Matrix {
    std::array::from_fn(|i| {
        let row = i / 3 * 3;
        let col = i % 3;
        left[row] * right[col] + left[row + 1] * right[3 + col] + left[row + 2] * right[6 + col]
    })
}

fn rotate_x(angle: f64) -> Matrix {
    let (s, c) = angle.sin_cos();
    [1., 0., 0., 0., c, -s, 0., s, c]
}

fn rotate_y(angle: f64) -> Matrix {
    let (s, c) = angle.sin_cos();
    [c, 0., s, 0., 1., 0., -s, 0., c]
}

fn flange_rotation(q: &[f64]) -> Matrix {
    let (s, c) = q[0].sin_cos();
    let base = [c, -s, 0., s, c, 0., 0., 0., 1.];
    [
        rotate_y(-q[1] - q[2]),
        rotate_x(q[3]),
        rotate_y(-q[4]),
        rotate_x(q[5]),
        [0., 0., 1., 0., -1., 0., 1., 0., 0.],
    ]
    .into_iter()
    .fold(base, multiply)
}

// SPC25 standard six-axis flange in controller BASE coordinates (mm, rad).
fn flange_position(q: &[f64], structure: &[f64]) -> [f64; 3] {
    let (s, c) = (q[1] + q[2]).sin_cos();
    let (s4, c4) = q[3].sin_cos();
    let (s5, c5) = q[4].sin_cos();
    let (s1, c1) = q[0].sin_cos();
    let (s2, c2) = q[1].sin_cos();
    let x = structure[0] - structure[1] * s2 - structure[2] * s
        + structure[3] * c
        + structure[4] * (c * c5 - s * c4 * s5);
    let y = -structure[4] * s4 * s5;
    let z = structure[5]
        + structure[1] * c2
        + structure[2] * c
        + structure[3] * s
        + structure[4] * (s * c5 + c * c4 * s5);
    [c1 * x - s1 * y, s1 * x + c1 * y, z]
}

#[no_mangle]
pub extern "C" fn six_rotation() {
    with_buffer(|b| {
        let rotation = flange_rotation(&b[..6]);
        b[..9].copy_from_slice(&rotation);
    });
}

#[no_mangle]
pub extern "C" fn six_position(with_tool: bool) {
    with_buffer(|b| {
        let mut result = flange_position(&b[..6], &b[6..12]);
        if with_tool {
            let rotation = flange_rotation(&b[..6]);
            for (position, row) in result.iter_mut().zip(rotation.chunks_exact(3)) {
                *position += row[0] * b[12] + row[1] * b[13] + row[2] * b[14];
            }
        }
        b[..3].copy_from_slice(&result);
    });
}
