import React, { useCallback, useEffect, useMemo, useState } from "react";
import BASE_URL from "../../../config/config";
import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/Global_responsive.css";
import Toast from "../../Global/Toast.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faBoxOpen,
  faMoneyBillWave,
} from "@fortawesome/free-solid-svg-icons";

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

  if (!text) {
    throw new Error("Respuesta vacía del servidor.");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`La API devolvió una respuesta inválida. HTTP ${res.status}`);
  }

  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  }

  return data;
}

function formatFecha(fecha) {
  const s = String(fecha || "").trim();
  if (!s) return "-";

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;

  return s;
}

function moneyARS(valor) {
  const n = Number(valor || 0);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s !== "" ? s : "-";
}

const PAGE_SIZE = 100;

const Cheques_Cartera = () => {
  const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [q, setQ] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);

  const showToast = useCallback((tipo, mensaje, duracion = 2600) => {
    setToast({ tipo, mensaje, duracion });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  const fetchCheques = useCallback(
    async ({ offset = 0, append = false, qValue = "" } = {}) => {
      const params = new URLSearchParams();
      params.set("action", "cheques_cartera_listar");
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      if (String(qValue || "").trim()) {
        params.set("q", String(qValue || "").trim());
      }

      const url = `${API_URL}?${params.toString()}`;

      const data = await parseJsonOrThrow(
        await fetch(url, {
          method: "GET",
          headers: getAuthHeaders(),
        })
      );

      const lista = Array.isArray(data?.cheques) ? data.cheques : [];

      if (append) {
        setAllRows((prev) => {
          const base = Array.isArray(prev) ? prev : [];
          const ids = new Set(base.map((x) => String(x.id_cheque)));
          return [...base, ...lista.filter((x) => !ids.has(String(x.id_cheque)))];
        });
      } else {
        setAllRows(lista);
      }

      setHasMore(!!data?.has_more);
      setNextOffset(Number(data?.next_offset || 0));

      return data;
    },
    [API_URL]
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      setError("");

      try {
        await fetchCheques({ offset: 0, append: false, qValue: "" });
      } catch (e) {
        if (!active) return;
        setError(e?.message || "No se pudieron cargar los cheques.");
      } finally {
        if (active) setLoading(false);
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [fetchCheques]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const value = q.trim().toLowerCase();

      if (!value) {
        setRows(allRows);
        return;
      }

      const filtrados = allRows.filter((item) => {
        const fechaEmision = String(item?.fecha_emision || "").toLowerCase();
        const emisor = String(item?.emisor || "").toLowerCase();
        const numero = String(item?.numero_cheque || "").toLowerCase();
        const importe = String(item?.importe || "").toLowerCase();
        const fechaPago = String(item?.fecha_pago || "").toLowerCase();

        return (
          fechaEmision.includes(value) ||
          emisor.includes(value) ||
          numero.includes(value) ||
          importe.includes(value) ||
          fechaPago.includes(value)
        );
      });

      setRows(filtrados);
    }, 200);

    return () => clearTimeout(timer);
  }, [q, allRows]);

  useEffect(() => {
    setRows(allRows);
  }, [allRows]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;

    setLoadingMore(true);
    setError("");

    try {
      const data = await fetchCheques({
        offset: nextOffset,
        append: true,
        qValue: "",
      });

      showToast(
        "exito",
        `${Array.isArray(data?.cheques) ? data.cheques.length : 0} cheques más cargados.`
      );
    } catch (e) {
      setError(e?.message || "No se pudieron cargar más cheques.");
      showToast("error", e?.message || "No se pudieron cargar más cheques.");
    } finally {
      setLoadingMore(false);
    }
  }, [fetchCheques, hasMore, loadingMore, nextOffset, showToast]);

  const columns = useMemo(
    () => [
      {
        key: "fecha_emision",
        label: "FECHA DE EMISIÓN",
        align: "left",
        render: (r) => formatFecha(r.fecha_emision),
      },
      {
        key: "emisor",
        label: "EMISOR",
        align: "left",
        render: (r) => safeText(r.emisor),
      },
      {
        key: "numero_cheque",
        label: "N° DE CHEQUE",
        align: "left",
        render: (r) => safeText(r.numero_cheque),
      },
      {
        key: "importe",
        label: "IMPORTE",
        align: "right",
        render: (r) => moneyARS(r.importe),
      },
      {
        key: "fecha_pago",
        label: "FECHA DE PAGO",
        align: "left",
        render: (r) => formatFecha(r.fecha_pago),
      },
    ],
    []
  );

  const gridCols = useMemo(() => "1.2fr 2fr 1.5fr 1.2fr 1.2fr", []);

  return (
    <div className="mov-page">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      {error && (
        <div className="mov-alert" role="alert">
          {error}
        </div>
      )}

      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div className="title-mov">
              <div className="mov-card__title">Cheques en Cartera</div>
              <div className="mov-card__hint">
                Mostrando <b>{rows.length}</b> registros
                {hasMore ? " (hay más por cargar)" : ""}
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="cc-filter cc-filter--search">
                <div className="cc-floatingField cc-floatingField--search is-active">
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating"
                        type="text"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Buscar por emisor, número de cheque, importe..."
                        autoComplete="off"
                      />

                      <span className="cc-floatingLabel">
                        <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mov-gridTable mov-gridTable--head"
          style={{ gridTemplateColumns: gridCols }}
          role="row"
        >
          {columns.map((c) => (
            <div
              key={c.key}
              className={[
                "mov-gridCell",
                "mov-gridCell--head",
                c.align === "right" ? "is-right" : "",
                c.align === "center" ? "is-center" : "",
              ].join(" ")}
              role="columnheader"
            >
              {c.label}
            </div>
          ))}
        </div>

        <div className="mov-tableWrap mov-tableWrap--mov" role="rowgroup">
          <div className="mov-gridBody mov-gridBody--relative">
            {loading ? (
              <div className="cc-emptyState">
                <FontAwesomeIcon icon={faMoneyBillWave} className="cc-emptyIcon" />
                <div className="cc-emptyText">Cargando cheques...</div>
              </div>
            ) : (
              <>
                {rows.map((r) => (
                  <div
                    key={r.id_cheque}
                    className="mov-gridTable mov-gridTable--row"
                    style={{ gridTemplateColumns: gridCols }}
                    role="row"
                  >
                    {columns.map((c) => {
                      const val = c.render(r);

                      return (
                        <div
                          key={c.key}
                          className={[
                            "mov-gridCell",
                            c.align === "right" ? "is-right" : "",
                            c.align === "center" ? "is-center" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          role="cell"
                          data-label={c.label}
                          title={typeof val === "string" ? val : undefined}
                        >
                          <span className="mov-ellipsissss">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {!loading && rows.length === 0 && (
                  <div className="cc-emptyState">
                    <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                    <div className="cc-emptyText">
                      {q.trim()
                        ? `No se encontraron cheques para "${q.trim()}".`
                        : "No hay cheques en cartera para mostrar."}
                    </div>
                  </div>
                )}

                {!loading && allRows.length > 0 && hasMore && q.trim() === "" && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      title="Cargar 100 registros más"
                    >
                      {loadingMore ? "Cargando..." : "Cargar 100 más"}
                    </button>
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

export default Cheques_Cartera;