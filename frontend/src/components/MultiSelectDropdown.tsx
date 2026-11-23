import { KeyboardEvent, useState } from "react";
import { Dropdown, Form } from "react-bootstrap";

export type MultiSelectOption = {
    value: number;
    label: string;
    /** Indentation, e.g. for nested categories. */
    level?: number;
};

type MultiSelectDropdownProps = {
    id: string;
    options: MultiSelectOption[];
    selected: number[];
    onChange: (selected: number[]) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    isInvalid?: boolean;
    disabled?: boolean;
};

/**
 * A dropdown to pick several options, with a search field. Selected options
 * are ticked and the menu stays open while picking.
 */
function MultiSelectDropdown({
    id, options, selected, onChange, placeholder = "Choose…", searchPlaceholder = "Search…",
    isInvalid = false, disabled = false,
}: MultiSelectDropdownProps) {
    const [query, setQuery] = useState("");

    const term = query.trim().toLowerCase();
    const filtered = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
    const summary = options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(", ");

    function toggle(value: number) {
        onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    }

    function handleSearchKey(e: KeyboardEvent<HTMLInputElement>) {
        // Enter would submit the surrounding form; pick the first match instead.
        if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) toggle(filtered[0].value);
        }
    }

    return (
        <Dropdown autoClose="outside" onToggle={(show) => { if (!show) setQuery(""); }}>
            <Dropdown.Toggle
                as="button"
                type="button"
                id={id}
                bsPrefix="form-select"
                className={`text-start text-truncate${isInvalid ? " is-invalid" : ""}`}
                disabled={disabled}
            >
                {summary || <span className="text-body-secondary">{placeholder}</span>}
            </Dropdown.Toggle>
            <Dropdown.Menu className="w-100 pt-0 shadow" style={{ maxHeight: "18rem", overflowY: "auto" }}>
                <div className="p-2 border-bottom sticky-top bg-body">
                    <Form.Control
                        type="search"
                        size="sm"
                        placeholder={searchPlaceholder}
                        aria-label={searchPlaceholder}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleSearchKey}
                        autoFocus
                    />
                </div>
                {filtered.length === 0 && <Dropdown.ItemText className="text-body-secondary">No matches</Dropdown.ItemText>}
                {filtered.map((option) => {
                    const checked = selected.includes(option.value);
                    return (
                        <Dropdown.Item
                            key={option.value}
                            as="button"
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={checked}
                            className="d-flex align-items-center"
                            onClick={() => toggle(option.value)}
                        >
                            <i
                                className={`bi bi-check-lg text-success me-2${checked ? "" : " invisible"}`}
                                aria-hidden="true"
                            />
                            <span style={{ paddingLeft: `${(option.level ?? 0) * 1.25}rem` }}>{option.label}</span>
                        </Dropdown.Item>
                    );
                })}
            </Dropdown.Menu>
        </Dropdown>
    );
}

export default MultiSelectDropdown;
