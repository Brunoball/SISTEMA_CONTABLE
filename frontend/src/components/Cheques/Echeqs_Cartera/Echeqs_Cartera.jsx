import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import BASE_URL from "../../../config/config";
import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/Global_responsive.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faBoxOpen,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

/* =========================
   Helpers
========================= */
function getAuthHeaders() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const headers = {};
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("La API devolvió una respuesta inválida.");
  }
  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  }
  return data;
}

function formatFecha(fecha) {
  if (!fecha) return "—";
  const s = String(fecha).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}

function formatMoney(value) {
  const n = Number(value || 0);
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}

function normalizeSearchText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   Config
========================= */
const PAGE_SIZE = 100;
const SKELETON_ROWS = 10;
const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

/* =========================
   Columns definition
========================= */
const COLUMNS = [
  { key: "fecha_emision",  label: "FECHA EMISIÓN", fr: 1,   align: "center" },
  { key: "emisor",         label: "EMISOR",         fr: 2.2, align: "left", strong: true },
  { key: "numero_cheque",  label: "NÚMERO",         fr: 1.2, align: "center" },
  { key: "importe",        label: "IMPORTE",        fr: 1.2, align: "right" },
  { key: "fecha_pago",     label: "FECHA PAGO",     fr: 1,   align: "center" },
];

const gridCols = COLUMNS.map((c) => `${c.fr}fr`).join(" ");

/* =========================
   Skeleton row
========================= */
const skelWidths = {
  fecha_emision: ["44%", "38%", "40%", "36%"],
  emisor:        ["72%", "58%", "66%", "48%"],
  numero_cheque: ["44%", "34%", "40%", "30%"],
  importe:       ["38%", "30%", "34%", "28%"],
  fecha_pago:    ["44%", "38%", "40%", "36%"],
};

function SkeletonRow({ idx }) {
  return (
    <div
      className="mov-gridTable mov-gridTable--row mov-row--skeleton"
      style={{ gridTemplateColumns: gridCols }}
      role="row"
      aria-hidden="true"
    >
      {COLUMNS.map((c) => {
        const list = skelWidths[c.key] || ["60%"];
        const w = list[idx % list.length];
        return (
          <div
            key={c.key}
            className={[
              "mov-gridCell",
              c.align === "right"  ? "is-right"  : "",
              c.align === "center" ? "is-center" : "",
            ].join(" ")}
            role="cell"
            data-label={c.label}
          >
            <span className="mov-skeletonBar" style={{ width: w }} />
          </div>
        );
      })}
    </div>
  );
}

/* =========================
   Main component
========================= */
const Echeqs_Cartera = () => {
  const [items, setItems]             = useState([]);
  const [q, setQ]                     = useState("");
  const [debouncedQ, setDebouncedQ]   = useState("");
  const [loading, setLoading]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(false);
  const [nextOffset, setNextOffset]   = useState(0);
  const [error, setError]             = useState("");

  const searchTimerRef = useRef(null);

  /* Debounce */
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQ(q.trim());
    }, 250);
    return () => clearTimeout(searchTimerRef.current);
  }, [q]);

  /* Fetch */
  const fetchData = useCallback(
    async ({ reset = false, offset = 0 } = {}) => {
      try {
        setError("");
        if (reset) setLoading(true);
        else setLoadingMore(true);

        const params = new URLSearchParams();
        params.set("action", "echeq_cartera_listar");
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        if (debouncedQ) params.set("q", debouncedQ);

        const res = await fetch(`${API_URL}?${params.toString()}`, {
          method: "GET",
          headers: getAuthHeaders(),
        });

        const data = await parseJsonOrThrow(res);
        const nuevos = Array.isArray(data?.echeqs) ? data.echeqs : [];

        setItems((prev) => (reset ? nuevos : [...prev, ...nuevos]));
        setHasMore(Boolean(data?.has_more));
        setNextOffset(Number(data?.next_offset || 0));
      } catch (err) {
        const mensaje = err?.message || "No se pudieron cargar los echeqs.";
        setError(mensaje);
        if (reset) {
          setItems([]);
          setHasMore(false);
          setNextOffset(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ]
  );

  useEffect(() => {
    fetchData({ reset: true, offset: 0 });
  }, [fetchData]);

  /* Render cell value */
  function renderCell(col, item) {
    switch (col.key) {
      case "fecha_emision": return safeText(formatFecha(item.fecha_emision));
      case "emisor":        return safeText(item.emisor);
      case "numero_cheque": return safeText(item.numero_cheque);
      case "importe":       return formatMoney(item.importe);
      case "fecha_pago":    return safeText(formatFecha(item.fecha_pago));
      default:              return "—";
    }
  }

  const cantidad = items.length;
  const isAnyLoading = loading || loadingMore;

  return (
    <div className="mov-page">
      {error && (
        <div className="mov-alert" role="alert">
          {error}
        </div>
      )}

      <section className="mov-card mov-card--table">
        {/* HEAD */}
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            {/* Título */}
            <div className="title-mov">
              <div className="mov-card__title">Echeqs · Cartera</div>
              <div className="mov-card__hint">
                Mostrando <b>{cantidad}</b> echeq{cantidad !== 1 ? "s" : ""}
                {hasMore && cantidad > 0 ? " (hay más)" : ""}
              </div>
            </div>

            {/* Filtros */}
            <div className="mov-headFilters">
              <div className="cc-filter cc-filter--search">
                <div className="cc-floatingField cc-floatingField--search is-active">
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating"
                        id="echeq-cartera-search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                            setDebouncedQ(e.currentTarget.value.trim());
                          }
                        }}
                        placeholder="Buscar por emisor, o numero..."
                        disabled={isAnyLoading}
                      />
                      <span className="cc-floatingLabel">
                        <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                      </span>
                      {q.trim() !== "" && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside"
                          title="Limpiar búsqueda"
                          onClick={() => {
                            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                            setQ("");
                            setDebouncedQ("");
                          }}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* HEADER DE TABLA */}
        <div
          className="mov-gridTable mov-gridTable--head"
          style={{ gridTemplateColumns: gridCols }}
          role="row"
        >
          {COLUMNS.map((c) => (
            <div
              key={c.key}
              className={[
                "mov-gridCell",
                "mov-gridCell--head",
                c.align === "right"  ? "is-right"  : "",
                c.align === "center" ? "is-center" : "",
              ].join(" ")}
              role="columnheader"
            >
              {c.label}
            </div>
          ))}
        </div>

        {/* BODY */}
        <div className="mov-tableWrap" role="rowgroup">
          <div
            className={[
              "mov-gridBody",
              "mov-gridBody--relative",
              loading ? "mov-softLoading" : "",
            ].join(" ")}
          >
            {loading ? (
              /* Skeleton inicial */
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <SkeletonRow key={`skel-${i}`} idx={i} />
                ))}
              </div>
            ) : (
              <>
                {items.map((item) => (
                  <div
                    key={item.id_cheque}
                    className="mov-gridTable mov-gridTable--row"
                    style={{ gridTemplateColumns: gridCols }}
                    role="row"
                  >
                    {COLUMNS.map((col) => {
                      const val = renderCell(col, item);
                      return (
                        <div
                          key={col.key}
                          className={[
                            "mov-gridCell",
                            col.align === "right"  ? "is-right"  : "",
                            col.align === "center" ? "is-center" : "",
                            col.strong             ? "is-strong" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          role="cell"
                          data-label={col.label}
                          title={typeof val === "string" ? val : undefined}
                        >
                          <span className="mov-ellipsissss">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Estado vacío */}
                {!isAnyLoading && items.length === 0 && (
                  <div className="cc-emptyState">
                    <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                    <div className="cc-emptyText">
                      {q.trim()
                        ? `No se encontraron echeqs para "${q.trim()}".`
                        : "No hay echeqs en cartera."}
                    </div>
                  </div>
                )}

                {/* Cargar más */}
                {!loading && hasMore && items.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={() => fetchData({ reset: false, offset: nextOffset })}
                      disabled={loadingMore}
                      title="Cargar los próximos 100 registros"
                    >
                      {loadingMore ? "Cargando…" : "Cargar 100 más"}
                    </button>
                  </div>
                )}

                {/* Skeleton "cargar más" */}
                {loadingMore && (
                  <div className="mov-skeletonMore" aria-busy="true" aria-label="Cargando más registros">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SkeletonRow key={`skel-more-${i}`} idx={i} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Echeqs_Cartera;