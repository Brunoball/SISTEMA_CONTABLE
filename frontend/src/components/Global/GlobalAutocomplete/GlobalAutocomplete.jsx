import React, { useEffect, useMemo, useRef, useState } from "react";
import "./GlobalAutocomplete.css";

function normalizeText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export default function GlobalAutocomplete({
  value = "",
  onChange,
  onSelect,
  options = [],
  getOptionLabel = (opt) => String(opt?.nombre ?? ""),
  getOptionValue = (opt) => String(opt?.id ?? getOptionLabel(opt)),
  placeholder = " ",
  label = "",
  disabled = false,
  showAllOnFocus = true,
  maxItems = 18,
  className = "",
  inputClassName = "",
  listClassName = "",
  itemClassName = "",
  labelClassName = "fl-label",
  emptyMessage = "Sin resultados",
  name,
  id,
}) {
  const wrapRef = useRef(null);
  const blurTimerRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedValue = normalizeText(value);

  const filteredOptions = useMemo(() => {
    const arr = Array.isArray(options) ? options : [];

    if (!normalizedValue) {
      return showAllOnFocus ? arr.slice(0, maxItems) : [];
    }

    return arr
      .filter((opt) =>
        normalizeText(getOptionLabel(opt)).includes(normalizedValue)
      )
      .slice(0, maxItems);
  }, [options, normalizedValue, getOptionLabel, showAllOnFocus, maxItems]);

  const safeActiveIndex =
    activeIndex >= filteredOptions.length ? 0 : activeIndex;

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  useEffect(() => {
    function handlePointerDownOutside(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) {
        setOpen(false);
        setActiveIndex(0);
      }
    }

    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);

    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const closeList = () => {
    setOpen(false);
    setActiveIndex(0);
  };

  const openList = () => {
    if (disabled) return;
    if (showAllOnFocus || normalizedValue) {
      setOpen(true);
    }
  };

  const handleFocus = () => {
    openList();
  };

  const handleBlur = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);

    blurTimerRef.current = setTimeout(() => {
      closeList();
    }, 120);
  };

  const selectOption = (opt) => {
    onSelect?.(opt);
    closeList();
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
      if (filteredOptions.length > 0) {
        e.preventDefault();
        setOpen(true);
      }
    }

    if (e.key === "ArrowDown") {
      if (!filteredOptions.length) return;
      e.preventDefault();
      setActiveIndex((prev) =>
        prev >= filteredOptions.length - 1 ? 0 : prev + 1
      );
      return;
    }

    if (e.key === "ArrowUp") {
      if (!filteredOptions.length) return;
      e.preventDefault();
      setActiveIndex((prev) =>
        prev <= 0 ? filteredOptions.length - 1 : prev - 1
      );
      return;
    }

    if (e.key === "Enter") {
      if (!open || !filteredOptions.length) return;
      e.preventDefault();
      selectOption(filteredOptions[safeActiveIndex]);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeList();
    }
  };

  return (
    <div
      ref={wrapRef}
      className={["ga-wrap", className].filter(Boolean).join(" ")}
    >
      <input
        id={id}
        name={name}
        className={["ga-input", inputClassName].filter(Boolean).join(" ")}
        type="text"
        value={value}
        placeholder={placeholder || " "}
        autoComplete="off"
        disabled={disabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onChange={(e) => {
          onChange?.(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
      />

      {label ? (
        <label
          htmlFor={id}
          className={labelClassName}
        >
          {label}
        </label>
      ) : null}

      {open && (
        <ul className={["ga-list", listClassName].filter(Boolean).join(" ")}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => {
              const active = idx === safeActiveIndex;
              const optionLabel = getOptionLabel(opt);
              const optionValue = getOptionValue(opt);

              return (
                <li
                  key={`${optionValue}-${idx}`}
                  className={[
                    "ga-item",
                    active ? "is-active" : "",
                    itemClassName,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(opt);
                  }}
                >
                  {optionLabel}
                </li>
              );
            })
          ) : (
            <li
              className={[
                "ga-item",
                "is-empty",
                itemClassName,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {emptyMessage}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}