use std::{
    cell::RefCell,
    future::{poll_fn, Future},
    ops::Range,
    pin::Pin,
    rc::Rc,
    task::{Context, Poll, Waker},
};

// The program counter and control stack belong to each robot task. Suspend at
// host operations so an unrelated robot can run, a move can finish, or an
// operator can stop or edit a running program between two instructions.
#[repr(i32)]
#[derive(Clone, Copy)]
enum Op {
    Cursor = 1,
    Command,
    Condition,
    InitFor,
    StepFor,
    LoopYield,
    Switch,
    Case,
    Limit,
}
struct Request {
    op: Op,
    index: usize,
    text: String,
}
#[derive(Clone, Copy, PartialEq)]
enum Action {
    Next,
    Break,
    Continue,
    Return,
    Jump(usize),
}
struct State {
    lines: Vec<String>,
    request: Option<Request>,
    response: Option<(i32, usize)>,
    limit: f64,
}
type Shared = Rc<RefCell<State>>;
type Block = Pin<Box<dyn Future<Output = Action>>>;

async fn ask(state: &Shared, op: Op, index: usize, text: &str) -> (i32, usize) {
    let mut request = Some(Request {
        op,
        index,
        text: text.into(),
    });
    poll_fn(|_| {
        let mut state = state.borrow_mut();
        if let Some(request) = request.take() {
            state.request = Some(request);
            Poll::Pending
        } else {
            Poll::Ready(state.response.take().unwrap())
        }
    })
    .await
}

fn keyword(line: &str) -> &str {
    let end = line
        .bytes()
        .position(|c| !(c.is_ascii_alphanumeric() || c == b'_'))
        .unwrap_or(line.len());
    &line[..end]
}

fn argument(line: &str) -> &str {
    line[keyword(line).len()..].trim()
}
fn statement_arg(line: &str) -> &str {
    let arg = argument(line);
    arg.strip_suffix(';').unwrap_or(arg).trim()
}

fn is_label(line: &str) -> bool {
    let Some((prefix, _)) = line.split_once(':') else {
        return false;
    };
    let prefix = prefix.trim_end();
    if prefix
        .as_bytes()
        .first()
        .is_some_and(|c| c.is_ascii_alphabetic() || *c == b'_')
        && keyword(prefix) == prefix
    {
        return true;
    }
    let Some(rest) = prefix.strip_prefix(['L', 'l']) else {
        return false;
    };
    let Some(digits) = rest
        .trim_start()
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
    else {
        return false;
    };
    !digits.trim().is_empty() && digits.trim().bytes().all(|c| c.is_ascii_digit())
}

struct Arm {
    range: Range<usize>,
    expression: Option<String>,
}
struct Construct {
    close: usize,
    arms: Vec<Arm>,
}
fn construct(lines: &[String], index: usize, end: usize, open: &str, close: &str) -> Construct {
    let end = end.min(lines.len());
    let mut last = end.saturating_sub(1);
    let mut arms = Vec::new();
    let mut header = if open == "IF" {
        Some((index, Some(argument(&lines[index]).to_owned())))
    } else {
        None
    };
    let mut depth = 1;
    for (i, line) in lines.iter().enumerate().take(end).skip(index + 1) {
        let word = keyword(line);
        if word.eq_ignore_ascii_case(open) {
            depth += 1;
            continue;
        }
        if word.eq_ignore_ascii_case(close) {
            depth -= 1;
            if depth == 0 {
                last = i;
                break;
            }
            continue;
        }
        if depth != 1 {
            continue;
        }
        let expr = if open == "IF" && word.eq_ignore_ascii_case("ELSEIF") {
            Some(argument(line))
        } else if open == "IF" && word.eq_ignore_ascii_case("ELSE") {
            None
        } else if open == "SWITCH"
            && word.eq_ignore_ascii_case("CASE")
            && line[word.len()..].starts_with(char::is_whitespace)
            && !argument(line).is_empty()
        {
            let arg = argument(line);
            Some(arg.strip_suffix(':').unwrap_or(arg).trim_end())
        } else if open == "SWITCH"
            && word.eq_ignore_ascii_case("DEFAULT")
            && matches!(argument(line), "" | ":")
        {
            None
        } else {
            continue;
        };
        if let Some((prior, expression)) = header.take() {
            arms.push(Arm {
                range: prior + 1..i,
                expression,
            });
        }
        header = Some((i, expr.map(str::to_owned)));
    }
    if let Some((prior, expression)) = header {
        arms.push(Arm {
            range: prior + 1..last,
            expression,
        });
    }
    Construct { close: last, arms }
}

fn block(state: Shared, range: Range<usize>, depth: usize) -> Block {
    Box::pin(async move {
        let mut i = range.start;
        while i < range.end {
            ask(&state, Op::Cursor, i, "").await;
            let line = state.borrow().lines.get(i).cloned().unwrap_or_default();
            let word = keyword(&line).to_ascii_uppercase();
            let mut next = i + 1;
            if line.is_empty()
                || is_label(&line)
                || word.starts_with("PROGRAMINFO")
                || word.starts_with("ENDPROGRAMINFO")
                || matches!(
                    word.as_str(),
                    "FUNC"
                        | "ENDFUNC"
                        | "ENDFOR"
                        | "ENDWHILE"
                        | "ENDIF"
                        | "ENDSWITCH"
                        | "ELSEIF"
                        | "ELSE"
                        | "CASE"
                        | "DEFAULT"
                )
            {
                i = next;
                continue;
            }
            match word.as_str() {
                "IF" => {
                    let group = construct(&state.borrow().lines, i, range.end, "IF", "ENDIF");
                    next = group.close + 1;
                    for arm in group.arms {
                        if let Some(expr) = arm.expression {
                            if ask(&state, Op::Condition, 0, &expr).await.0 == 0 {
                                continue;
                            }
                        }
                        let result = block(state.clone(), arm.range, depth + 1).await;
                        if result != Action::Next {
                            return result;
                        }
                        break;
                    }
                }
                "FOR" | "WHILE" => {
                    let is_for = word == "FOR";
                    let close = construct(
                        &state.borrow().lines,
                        i,
                        range.end,
                        &word,
                        if is_for { "ENDFOR" } else { "ENDWHILE" },
                    )
                    .close;
                    next = close + 1;
                    let arg = statement_arg(&line);
                    if is_for {
                        ask(&state, Op::InitFor, depth, arg).await;
                    }
                    let mut iterations = 0.0;
                    loop {
                        // A For condition refers to the prepared counter and step at this depth.
                        let slot = if is_for { depth + 1 } else { 0 };
                        if ask(&state, Op::Condition, slot, if is_for { "" } else { arg })
                            .await
                            .0
                            == 0
                        {
                            break;
                        }
                        if iterations >= state.borrow().limit {
                            ask(&state, Op::Limit, 0, &word).await;
                            return Action::Next;
                        }
                        iterations += 1.0;
                        match block(state.clone(), i + 1..close, depth + 1).await {
                            Action::Break => break,
                            Action::Next | Action::Continue => (),
                            other => return other,
                        }
                        if is_for {
                            ask(&state, Op::StepFor, depth, "").await;
                        }
                        ask(&state, Op::LoopYield, 0, "").await;
                    }
                }
                "SWITCH" => {
                    let group =
                        construct(&state.borrow().lines, i, range.end, "SWITCH", "ENDSWITCH");
                    next = group.close + 1;
                    ask(&state, Op::Switch, 0, statement_arg(&line)).await;
                    let mut first = group.arms.len();
                    let mut default = group.arms.len();
                    for (n, arm) in group.arms.iter().enumerate() {
                        if let Some(expr) = &arm.expression {
                            if ask(&state, Op::Case, 0, expr).await.0 != 0 {
                                first = n;
                                break;
                            }
                        } else {
                            default = default.min(n);
                        }
                    }
                    let matched = first < group.arms.len();
                    for arm in group
                        .arms
                        .into_iter()
                        .skip(if matched { first } else { default })
                    {
                        if matched && arm.expression.is_none() {
                            break;
                        }
                        match block(state.clone(), arm.range, depth + 1).await {
                            Action::Break => break,
                            Action::Next => (),
                            other => return other,
                        }
                    }
                }
                _ => match ask(&state, Op::Command, i, &line).await {
                    (1, _) => return Action::Break,
                    (2, _) => return Action::Continue,
                    (3, _) => return Action::Return,
                    (4, target) if range.contains(&target) => next = target,
                    (4, target) => return Action::Jump(target),
                    _ => (),
                },
            }
            i = next;
        }
        Action::Next
    })
}

pub struct Program {
    state: Shared,
    future: Block,
    input: Vec<u8>,
}
#[no_mangle]
pub extern "C" fn flow_new(start: usize, end: usize, limit: f64) -> *mut Program {
    let state = Rc::new(RefCell::new(State {
        lines: vec![],
        request: None,
        response: None,
        limit,
    }));
    let future = block(state.clone(), start..end, 0);
    Box::into_raw(Box::new(Program {
        state,
        future,
        input: vec![],
    }))
}
#[no_mangle]
pub extern "C" fn flow_input(task: &mut Program, len: usize) -> *mut u8 {
    task.input.resize(len, 0);
    task.input.as_mut_ptr()
}
#[no_mangle]
pub extern "C" fn flow_set_source(task: &mut Program) {
    task.state.borrow_mut().lines = String::from_utf8_lossy(&task.input)
        .split('\n')
        .map(|s| s.split('#').next().unwrap().trim().to_owned())
        .collect();
}
#[no_mangle]
pub extern "C" fn flow_poll(task: &mut Program, status: i32, destination: usize) -> i32 {
    {
        let mut state = task.state.borrow_mut();
        if state.request.take().is_some() {
            state.response = Some((status, destination));
        }
    }
    match task
        .future
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    {
        Poll::Ready(Action::Next) => 0,
        Poll::Ready(_) => -1,
        Poll::Pending => task.state.borrow().request.as_ref().unwrap().op as i32,
    }
}
#[no_mangle]
pub extern "C" fn flow_index(task: &Program) -> usize {
    task.state.borrow().request.as_ref().unwrap().index
}
#[no_mangle]
pub extern "C" fn flow_text(task: &Program) -> *const u8 {
    task.state.borrow().request.as_ref().unwrap().text.as_ptr()
}
#[no_mangle]
pub extern "C" fn flow_len(task: &Program) -> usize {
    task.state.borrow().request.as_ref().unwrap().text.len()
}
#[no_mangle]
pub unsafe extern "C" fn flow_drop(task: *mut Program) {
    drop(Box::from_raw(task));
}
