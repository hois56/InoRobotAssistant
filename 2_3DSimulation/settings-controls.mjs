// Reconcile choices in their owning document. Unchanged options can stay open in a native dropdown.
export function syncSettingsOptions(select, choices, preferred = select?.value) {
    if (!select) return;
    const previous = new Map(Array.from(select.options, option => [option.value, option]));
    for (const [index, choice] of choices.entries()) {
        const value = String(choice.value);
        const option = previous.get(value) || select.ownerDocument.createElement('option');
        previous.delete(value);
        if (option.value !== value) option.value = value;
        if (option.textContent !== choice.label) option.textContent = choice.label;
        // An empty value must remain explicit even when the label is nonempty.
        if (!option.hasAttribute('value')) option.value = value;
        if (option.disabled !== Boolean(choice.disabled)) option.disabled = Boolean(choice.disabled);
        if (select.options[index] !== option) select.insertBefore(option, select.options[index] || null);
    }
    for (const option of previous.values()) option.remove();
    const selected = choices.find(choice => String(choice.value) === String(preferred))
        || choices.find(choice => !choice.disabled) || choices[0];
    if (selected && select.value !== String(selected.value)) select.value = String(selected.value);
}

const shown = new WeakMap();

// Preserve an uncommitted edit until its owner applies it or switches context.
export function syncSetting(control, value, force = false) {
    if (!control) return;
    const key = control.type === 'checkbox' ? 'checked' : 'value';
    const next = key === 'checked' ? Boolean(value) : String(value ?? '');
    if (force || !shown.has(control) || control[key] === shown.get(control)) {
        if (control[key] !== next) control[key] = next;
    }
    shown.set(control, next);
}
