import React, { useCallback, useEffect, useMemo, useState } from "react";
import BASE_URL from "../../../config/config";
import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/Global_responsive.css";
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
    throw new Error("La API devolvió una respuesta inválida.");
  }

  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  }

  return data;
}

function formatFecha(fecha) {
  if (!fecha) return "-";
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

const PAGE_SIZE = 100;
const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

const Echeqs_Cartera = () => {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(inputValue.trim());
    }, 300);

    return () => clearTimeout(t);
  }, [inputValue]);

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
        if (query) params.set("q", query);

        const res = await fetch(`${API_URL}?${params.toString()}`, {
          method: "GET",
          headers: {
            ...getAuthHeaders(),
          },
        });

        const data = await parseJsonOrThrow(res);
        const nuevos = Array.isArray(data?.echeqs) ? data.echeqs : [];

        setItems((prev) => (reset ? nuevos : [...prev, ...nuevos]));
        setHasMore(Boolean(data?.has_more));
        setNextOffset(Number(data?.next_offset || 0));
      } catch (error) {
        const mensaje = error?.message || "No se pudieron cargar los echeqs.";
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
    [query]
  );

  useEffect(() => {
    fetchData({ reset: true, offset: 0 });
  }, [fetchData]);

  const cantidad = useMemo(() => items.length, [items]);

  return (
    <div className="global-section">
      <div className="global-section-header">
        <div>
          <h2>Echeqs en Cartera</h2>
          <p>Listado de echeqs disponibles.</p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ position: "relative", minWidth: 280, flex: "1 1 320px" }}>
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.65,
            }}
          />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Buscar por emisor, número, fecha o importe..."
            style={{
              width: "100%",
              padding: "10px 12px 10px 36px",
              borderRadius: 10,
              border: "1px solid #d0d7de",
              outline: "none",
            }}
          />
        </div>

        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #d0d7de",
            background: "#fff",
            fontWeight: 600,
          }}
        >
          Registros: {cantidad}
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={thStyle}>Fecha emisión</th>
                <th style={thStyle}>Emisor</th>
                <th style={thStyle}>Número</th>
                <th style={thStyle}>Importe</th>
                <th style={thStyle}>Fecha pago</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={emptyStyle}>
                    Cargando echeqs...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={emptyStyle}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 10,
                        padding: "18px 0",
                      }}
                    >
                      <FontAwesomeIcon icon={faBoxOpen} size="2x" />
                      <span>No hay echeqs en cartera.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id_cheque} style={{ borderTop: "1px solid #edf2f7" }}>
                    <td style={tdStyle}>{formatFecha(item.fecha_emision)}</td>
                    <td style={tdStyle}>{item.emisor || "-"}</td>
                    <td style={tdStyle}>{item.numero_cheque || "-"}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          fontWeight: 700,
                        }}
                      >
                        <FontAwesomeIcon icon={faMoneyBillWave} />
                        {formatMoney(item.importe)}
                      </span>
                    </td>
                    <td style={tdStyle}>{formatFecha(item.fecha_pago)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && hasMore && (
          <div style={{ padding: 16, textAlign: "center", borderTop: "1px solid #edf2f7" }}>
            <button
              type="button"
              onClick={() => fetchData({ reset: false, offset: nextOffset })}
              disabled={loadingMore}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                cursor: loadingMore ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              {loadingMore ? "Cargando..." : "Cargar más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const thStyle = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 14,
  fontWeight: 700,
  color: "#1f2937",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "14px 16px",
  fontSize: 14,
  color: "#111827",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const emptyStyle = {
  padding: "28px 16px",
  textAlign: "center",
  color: "#6b7280",
};

export default Echeqs_Cartera;