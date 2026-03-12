import React, { useEffect, useMemo, useRef, useState } from "react";
import "./GlobalAutocomplete.css"
function normalizeText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export default function GlobalAutocomplete({
  value,
  onChange,
  onSelect,
  options = [],
  getOptionLabel = (x) => x?.nombre ?? "",
  getOptionValue = (x) => x?.id ?? "",
  placeholder = " ",
  label = "",
  disabled = false,
  showAllOnFocus = true,
  maxItems = 18,
  className = "",
  inputClassName = "",
  listClassName = "",
  itemClassName = "",
}) {
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredOptions = useMemo(() => {
    const q = normalizeText(value);

    if (!q) {
      return showAllOnFocus ? options.slice(0, maxItems) : [];
    }

    return options
      .filter((opt) => normalizeText(getOptionLabel(opt)).includes(q))
      .slice(0, maxItems);
  }, [value, options, getOptionLabel, maxItems, showAllOnFocus]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (!wrapperRef.current?.contains(e.target)) {
        setOpen(false);
        setActiveIndex(0);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showList = open && filteredOptions.length > 0;
  const safeIndex =
    activeIndex >= filteredOptions.length ? 0 : activeIndex;

  const handleKeyDown = (e) => {
    if (!showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      if (filteredOptions.length > 0) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (!filteredOptions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((prev) =>
        prev >= filteredOptions.length - 1 ? 0 : prev + 1
      );
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((prev) =>
        prev <= 0 ? filteredOptions.length - 1 : prev - 1
      );
      return;
    }

    if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      const picked = filteredOptions[safeIndex];
      if (!picked) return;

      onSelect?.(picked);
      setOpen(false);
      setActiveIndex(0);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(0);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`ga-wrap ${className}`.trim()}
    >
      <input
        ref={inputRef}
        className={`ga-input ${inputClassName}`.trim()}
        value={value}
        onChange={(e) => {
          onChange?.(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => {
          if (showAllOnFocus || String(value || "").trim() !== "") {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
      />

      {label ? <label className="ga-label">{label}</label> : null}

      {showList && (
        <ul className={`ga-list ${listClassName}`.trim()}>
          {filteredOptions.map((opt, idx) => {
            const active = idx === safeIndex;
            return (
              <li
                key={`${getOptionValue(opt)}-${idx}`}
                className={`ga-item ${active ? "is-active" : ""} ${itemClassName}`.trim()}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect?.(opt);
                  setOpen(false);
                  setActiveIndex(0);
                }}
              >
                {getOptionLabel(opt)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}