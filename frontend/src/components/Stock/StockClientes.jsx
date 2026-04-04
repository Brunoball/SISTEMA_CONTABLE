import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import "./Stock.css";
import "../Global/Global_css/Global_Section.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPenToSquare,
  faTrashCan,
  faUser,
  faUserSlash,
  faUserCheck,
  faFloppyDisk,
  faTimes,
  faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";
import ModalEliminar from "../Global/Modales/ModalEliminar";
import Toast from "../Global/Toast";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

const COLUMNS = [
  { key: "nombre", label: "NOMBRE", align: "left" },
  { key: "estado", label: "ESTADO", align: "center" },
  { key: "acciones", label: "ACCIONES", align: "center" },
];

const SKELETON_ROWS = 6;

function buildHeadersGET() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function buildHeadersJSON() {
  return { ...buildHeadersGET(), "Content-Type": "application/json" };
}

function toUpperValue(value) {
  return String(value || "").toUpperCase();
}

function getClienteId(row) {
  return Number(row?.id_cliente ?? row?.id ?? 0);
}

async function parseJsonOrThrow(res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error("Sesión vencida o no autorizada. Volvé a iniciar sesión.");
  }

  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  try {
    const data = JSON.parse(text);
    if (!res.ok || data?.exito === false) {
      throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.message && !e.message.startsWith("Unexpected token")) {
      throw e;
    }

    const preview = text.length > 400 ? `${text.slice(0, 400)}...` : text;
    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `Respuesta inválida del servidor. HTTP ${res.status}\n${preview}`
    );
  }
}

async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
  return parseJsonOrThrow(res);
}

async function apiPost(action, body) {
  const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: buildHeadersJSON(),
    body: JSON.stringify(body || {}),
  });
  return parseJsonOrThrow(res);
}

export default function StockClientes() {
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accionandoId, setAccionandoId] = useState(null);

  const [clientes, setClientes] = useState([]);
  const [pestana, setPestana] = useState("activos");

  const [dropOpen, setDropOpen] = useState(false);
  const [modo, setModo] = useState("crear");
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nombre: "", activo: 1 });

  const dropWrapRef = useRef(null);
  const nombreRef = useRef(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState(null); // "alta" | "baja" | "eliminar"
  const [modalRow, setModalRow] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    if (!dropOpen) return;

    const handler = (e) => {
      if (dropWrapRef.current && !dropWrapRef.current.contains(e.target)) {
        cerrarDrop();
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]); // eslint-disable-line

  const mostrarToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast({ tipo, mensaje, duracion, id: Date.now() + Math.random() });
  }, []);

  const resetForm = useCallback(() => {
    setModo("crear");
    setEditandoId(null);
    setForm({ nombre: "", activo: 1 });
  }, []);

  const cerrarDrop = useCallback(() => {
    setDropOpen(false);
    setTimeout(resetForm, 180);
  }, [resetForm]);

  const abrirDropNuevo = useCallback(() => {
    resetForm();
    setDropOpen(true);
    setTimeout(() => nombreRef.current?.focus(), 120);
  }, [resetForm]);

  const toggleDrop = useCallback(() => {
    dropOpen ? cerrarDrop() : abrirDropNuevo();
  }, [dropOpen, cerrarDrop, abrirDropNuevo]);

  const cargarClientes = useCallback(
    async (tab) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          action: "stock_clientes_listar",
          activo: tab === "inactivos" ? "0" : "1",
        });

        const data = await apiGet(`${API_URL}?${params.toString()}`);
        setClientes(Array.isArray(data?.clientes) ? data.clientes : []);
      } catch (err) {
        mostrarToast("error", err?.message || "No se pudieron cargar los clientes.");
      } finally {
        setLoading(false);
      }
    },
    [mostrarToast]
  );

  useEffect(() => {
    cargarClientes(pestana);
    cerrarDrop();
  }, [pestana]); // eslint-disable-line

  const clientesOrdenados = useMemo(() => {
    return [...clientes].sort((a, b) =>
      String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", {
        sensitivity: "base",
      })
    );
  }, [clientes]);

  const iniciarEdicion = useCallback((row) => {
    setModo("editar");
    setEditandoId(getClienteId(row));
    setForm({
      nombre: toUpperValue(row?.nombre),
      activo: Number(row?.activo ?? 1) === 1 ? 1 : 0,
    });
    setDropOpen(true);
    setTimeout(() => nombreRef.current?.focus(), 120);
  }, []);

  const handleGuardar = async () => {
    const payload = {
      nombre: toUpperValue(form.nombre).trim(),
      activo: Number(form.activo) === 1 ? 1 : 0,
    };

    if (!payload.nombre) {
      mostrarToast("error", "El nombre del cliente es obligatorio.");
      nombreRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      if (modo === "crear") {
        const data = await apiPost("stock_cliente_crear", payload);
        mostrarToast("exito", data?.mensaje || "Cliente creado correctamente.");
      } else {
        const data = await apiPost("stock_cliente_actualizar", {
          id_cliente: editandoId,
          ...payload,
        });
        mostrarToast("exito", data?.mensaje || "Cliente actualizado correctamente.");
      }

      const tab = payload.activo === 1 ? "activos" : "inactivos";
      setPestana(tab);
      await cargarClientes(tab);

      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
      window.dispatchEvent(new CustomEvent("balto:listas-updated"));

      cerrarDrop();
    } catch (err) {
      mostrarToast("error", err?.message || "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGuardar();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cerrarDrop();
    }
  };

  const abrirModalAccion = useCallback((type, row) => {
    setModalAction(type);
    setModalRow(row);
    setModalOpen(true);
  }, []);

  const cerrarModalAccion = useCallback(() => {
    if (modalLoading) return;
    setModalOpen(false);
    setModalAction(null);
    setModalRow(null);
  }, [modalLoading]);

  const ejecutarAccionModal = useCallback(async () => {
    const row = modalRow;
    const type = modalAction;
    const id = getClienteId(row);

    if (!id || !type) {
      throw new Error("No se encontró el cliente seleccionado.");
    }

    setModalLoading(true);
    setAccionandoId(id);

    try {
      let action = "";
      let mensajeExito = "";
      let recargarTab = pestana;

      if (type === "baja") {
        action = "stock_cliente_dar_baja";
        mensajeExito = "Cliente dado de baja correctamente.";
        recargarTab = "activos";
      } else if (type === "alta") {
        action = "stock_cliente_dar_alta";
        mensajeExito = "Cliente dado de alta correctamente.";
        recargarTab = "inactivos";
      } else if (type === "eliminar") {
        action = "stock_cliente_eliminar";
        mensajeExito = "Cliente eliminado correctamente.";
        recargarTab = pestana;
      } else {
        throw new Error("Acción inválida.");
      }

      const data = await apiPost(action, { id_cliente: id });

      if ((type === "baja" || type === "eliminar") && id === Number(editandoId || 0)) {
        cerrarDrop();
      }

      await cargarClientes(recargarTab);
      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
      window.dispatchEvent(new CustomEvent("balto:listas-updated"));

      setModalOpen(false);
      setModalAction(null);
      setModalRow(null);

      mostrarToast("exito", data?.mensaje || mensajeExito);
    } catch (err) {
      mostrarToast("error", err?.message || "No se pudo completar la acción.");
      throw err;
    } finally {
      setModalLoading(false);
      setAccionandoId(null);
    }
  }, [modalRow, modalAction, pestana, editandoId, cargarClientes, cerrarDrop, mostrarToast]);

  const modalConfig = useMemo(() => {
    const nombre = String(modalRow?.nombre || "—");
    const activo = Number(modalRow?.activo ?? 1) === 1;

    if (modalAction === "baja") {
      return {
        title: "Dar de baja cliente",
        message: "¿Seguro que querés dar de baja este cliente?",
        warning: "El cliente pasará a la pestaña de inactivos.",
        loadingMessage: "Dando de baja cliente...",
        successMessage: "Cliente dado de baja correctamente.",
        errorMessage: "No se pudo dar de baja el cliente.",
        confirmLabel: "Dar de baja",
        confirmVariant: "danger",
        details: [
          { label: "ID Cliente", value: `#${getClienteId(modalRow)}` },
          { label: "Nombre", value: nombre },
          { label: "Estado actual", value: "Activo" },
        ],
      };
    }

    if (modalAction === "alta") {
      return {
        title: "Dar de alta cliente",
        message: "¿Seguro que querés dar de alta este cliente?",
        warning: "El cliente volverá a la pestaña de activos.",
        loadingMessage: "Dando de alta cliente...",
        successMessage: "Cliente dado de alta correctamente.",
        errorMessage: "No se pudo dar de alta el cliente.",
        confirmLabel: "Dar de alta",
        confirmVariant: "primary",
        details: [
          { label: "ID Cliente", value: `#${getClienteId(modalRow)}` },
          { label: "Nombre", value: nombre },
          { label: "Estado actual", value: "Inactivo" },
        ],
      };
    }

    return {
      title: "Eliminar cliente",
      message: "¿Seguro que querés eliminar este cliente definitivamente?",
      warning: "Esta acción no se puede deshacer.",
      loadingMessage: "Eliminando cliente...",
      successMessage: "Cliente eliminado correctamente.",
      errorMessage: "No se pudo eliminar el cliente.",
      confirmLabel: "Eliminar",
      confirmVariant: "danger",
      details: [
        { label: "ID Cliente", value: `#${getClienteId(modalRow)}` },
        { label: "Nombre", value: nombre },
        { label: "Estado", value: activo ? "Activo" : "Inactivo" },
      ],
    };
  }, [modalAction, modalRow]);

  const renderSkelRow = (idx) => (
    <div
      key={`sk-${idx}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton sc-grid"
      role="row"
      aria-hidden="true"
    >
      <div className="mov-gridCell" role="cell">
        <span
          className="mov-skeletonBar"
          style={{ width: ["72%", "58%", "66%", "48%", "62%", "54%"][idx % 6] }}
        />
      </div>
      <div className="mov-gridCell is-center" role="cell">
        <span className="mov-skeletonBar" style={{ width: "44%" }} />
      </div>
      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell">
        <div className="mov-skelActions">
          <span className="mov-skelIcon" />
          <span className="mov-skelIcon" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      

      <div className="mov-page">
        <section className="mov-card mov-card--table">
          <div className="mov-card__head">
            <div className="mov-card__headLeft">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div className="mov-card__title">Stock · Clientes</div>
                <div className="mov-card__hint">
                  Mostrando <b>{clientesOrdenados.length}</b> cliente
                  {clientesOrdenados.length !== 1 ? "s" : ""}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                <div className="mov-tabs">
                  <button
                    type="button"
                    className={`mov-tab ${pestana === "activos" ? "is-active" : ""}`}
                    onClick={() => setPestana("activos")}
                    disabled={loading || saving || modalLoading}
                  >
                    Activos
                  </button>
                  <button
                    type="button"
                    className={`mov-tab ${pestana === "inactivos" ? "is-active" : ""}`}
                    onClick={() => setPestana("inactivos")}
                    disabled={loading || saving || modalLoading}
                  >
                    Inactivos
                  </button>
                </div>
              </div>
            </div>

            <div className="mov-card__actions">
              <div className="sc-dropWrap" ref={dropWrapRef}>
                <button
                  type="button"
                  className={`mov-btn mov-btn--primary ${dropOpen ? "sc-btn--open" : ""}`}
                  onClick={toggleDrop}
                  disabled={saving || modalLoading}
                  title={dropOpen ? "Cerrar" : "Agregar nuevo cliente"}
                >
                  <FontAwesomeIcon
                    icon={dropOpen && modo === "editar" ? faPenToSquare : faPlus}
                    style={{ marginRight: 7 }}
                  />
                  {dropOpen && modo === "editar" ? "Editando" : "Nuevo cliente"}
                </button>

                {dropOpen && (
                  <div
                    className="sc-dropdown"
                    role="dialog"
                    aria-modal="false"
                    aria-label={modo === "crear" ? "Nuevo cliente" : "Editar cliente"}
                  >
                    <div className="sc-dropdown__title">
                      <FontAwesomeIcon
                        icon={modo === "crear" ? faPlus : faPenToSquare}
                        style={{ opacity: 0.75 }}
                      />
                      {modo === "crear" ? "Nuevo cliente" : "Editar cliente"}
                    </div>

                    {modo === "editar" && (
                      <div className="sc-editBanner">
                        <FontAwesomeIcon icon={faPenToSquare} />
                        Editando #{editandoId}
                      </div>
                    )}

                    <div className={`sc-floatingField ${form.nombre ? "is-active" : ""}`}>
                      <input
                        ref={nombreRef}
                        className="sc-input"
                        placeholder=" "
                        value={form.nombre}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, nombre: toUpperValue(e.target.value) }))
                        }
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                      />
                      <label className="sc-floatingLabel">
                        <FontAwesomeIcon icon={faUser} /> Nombre *
                      </label>
                    </div>

                    <div className="sc-floatingField is-active">
                      <select
                        className="sc-input"
                        value={String(form.activo)}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, activo: Number(e.target.value) }))
                        }
                        disabled={saving}
                      >
                        <option value="1">Activo</option>
                        <option value="0">Inactivo</option>
                      </select>
                      <label className="sc-floatingLabel">Estado</label>
                    </div>

                    <div className="sc-formActions">
                      <button
                        type="button"
                        className="mov-btn mov-btn--primary"
                        onClick={handleGuardar}
                        disabled={saving}
                      >
                        <FontAwesomeIcon icon={faFloppyDisk} style={{ marginRight: 7 }} />
                        {saving ? "Guardando…" : modo === "crear" ? "Crear" : "Guardar"}
                      </button>

                      <button
                        type="button"
                        className="mov-btn mov-btn--ghost"
                        onClick={cerrarDrop}
                        disabled={saving}
                      >
                        <FontAwesomeIcon icon={faTimes} style={{ marginRight: 6 }} />
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mov-gridTable mov-gridTable--head sc-grid" role="row">
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={[
                  "mov-gridCell",
                  "mov-gridCell--head",
                  c.align === "center" ? "is-center" : "",
                  c.align === "right" ? "is-right" : "",
                ].join(" ")}
                role="columnheader"
              >
                {c.label}
              </div>
            ))}
          </div>

          <div className="mov-tableWrap" role="rowgroup">
            <div className={["mov-gridBody", loading ? "mov-softLoading" : ""].join(" ")}>
              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkelRow(i))}
                </div>
              ) : clientesOrdenados.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <FontAwesomeIcon
                    icon={faBoxOpen}
                    style={{
                      fontSize: 28,
                      opacity: 0.3,
                      marginBottom: 10,

                    }}
                  />
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--mov-muted)",
                      fontWeight: 520,
                    }}
                  >
                    {pestana === "activos"
                      ? "No hay clientes activos."
                      : "No hay clientes inactivos."}
                  </div>
                </div>
              ) : (
                clientesOrdenados.map((row) => {
                  const activo = Number(row?.activo ?? 1) === 1;
                  const isEditing =
                    getClienteId(row) === Number(editandoId || 0) &&
                    modo === "editar" &&
                    dropOpen;
                  const bloqueado = accionandoId === getClienteId(row) || saving || modalLoading;

                  return (
                    <div
                      key={getClienteId(row)}
                      className={[
                        "mov-gridTable",
                        "mov-gridTable--row",
                        "sc-grid",
                        isEditing ? "sc-row--editing" : "",
                      ].join(" ").trim()}
                      role="row"
                    >
                      <div className="mov-gridCell is-strong" role="cell" data-label="NOMBRE">
                        <span className="mov-ellipsissss" title={row?.nombre || "—"}>
                          {row?.nombre || "—"}
                        </span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="ESTADO">
                        <span className={`sc-chip ${activo ? "sc-chip--active" : "sc-chip--inactive"}`}>
                          {activo ? "Activo" : "Inactivo"}
                        </span>
                      </div>

                      <div
                        className="mov-gridCell mov-gridCell--actions is-center"
                        role="cell"
                        data-label="ACCIONES"
                      >
                        <div className="mov-actionsInline">
                          {activo ? (
                            <>
                              <button
                                type="button"
                                className="mov-iconBtn"
                                onClick={() => iniciarEdicion(row)}
                                disabled={bloqueado}
                                title="Editar"
                              >
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>

                              <button
                                type="button"
                                className="mov-iconBtn"
                                onClick={() => abrirModalAccion("baja", row)}
                                disabled={bloqueado}
                                title="Dar de baja"
                              >
                                <FontAwesomeIcon icon={faUserSlash} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="mov-iconBtn"
                              onClick={() => abrirModalAccion("alta", row)}
                              disabled={bloqueado}
                              title="Dar de alta"
                            >
                              <FontAwesomeIcon icon={faUserCheck} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger"
                            onClick={() => abrirModalAccion("eliminar", row)}
                            disabled={bloqueado}
                            title="Eliminar"
                          >
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      <ModalEliminar
        open={modalOpen}
        row={
          modalRow
            ? {
                id: getClienteId(modalRow),
                nombre: modalRow?.nombre || "—",
                estado: Number(modalRow?.activo ?? 1) === 1 ? "Activo" : "Inactivo",
              }
            : null
        }
        loading={modalLoading}
        onClose={cerrarModalAccion}
        onConfirm={ejecutarAccionModal}
        onToast={mostrarToast}
        title={modalConfig.title}
        message={modalConfig.message}
        warning={modalConfig.warning}
        loadingMessage={modalConfig.loadingMessage}
        successMessage={modalConfig.successMessage}
        errorMessage={modalConfig.errorMessage}
        confirmLabel={modalConfig.confirmLabel}
        cancelLabel="Cancelar"
        confirmVariant={modalConfig.confirmVariant}
        details={modalConfig.details}
      />

      {toast && (
        <Toast
          key={toast.id}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}