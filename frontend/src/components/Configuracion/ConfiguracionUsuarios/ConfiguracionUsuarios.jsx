import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../../config/config";
import "./ConfiguracionUsuarios.css";

const API_RELATIVE = "api.php";

function buildApiUrl(paramsObj = {}) {
  const baseRaw = String(BASE_URL || "").trim();
  const base = baseRaw.replace(/\/+$/, "") + "/";
  const url = new URL(API_RELATIVE, base);
  const qs = new URLSearchParams();
  Object.entries(paramsObj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });
  url.search = qs.toString();
  return url.toString();
}

function getSessionKey() {
  return String(localStorage.getItem("session_key") || "").trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function apiFetch(paramsObj = {}, options = {}) {
  const headers = new Headers(options.headers || {});
  const sessionKey = getSessionKey();
  if (sessionKey) headers.set("X-Session", sessionKey);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(buildApiUrl(paramsObj), { ...options, headers });
}

const emptyForm = {
  idUsuarioMaster: 0,
  usuario: "",
  email_recuperacion: "",
  contrasena: "",
  idRolMaster: "",
  tema: "claro",
  activo: 1,
};

export default function ConfiguracionUsuarios() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const esEdicion = Number(form.idUsuarioMaster || 0) > 0;

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch({ action: "configuracion_usuarios_listar" });
      const txt = await res.text();
      const data = safeJsonParse(txt);
      if (!res.ok || !data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar los usuarios.");
      setUsuarios(Array.isArray(data.usuarios) ? data.usuarios : []);
      setRoles(Array.isArray(data.roles) ? data.roles : []);
    } catch (e) {
      setError(e?.message || "Error cargando usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!form.idRolMaster && roles.length > 0) {
      const empleado = roles.find((r) => r.codigo === "empleado_basico") || roles[0];
      setForm((prev) => ({ ...prev, idRolMaster: empleado.idRolMaster }));
    }
  }, [roles, form.idRolMaster]);

  const rolesById = useMemo(() => {
    const map = new Map();
    roles.forEach((r) => map.set(Number(r.idRolMaster), r));
    return map;
  }, [roles]);

  const limpiar = () => {
    const empleado = roles.find((r) => r.codigo === "empleado_basico") || roles[0];
    setForm({ ...emptyForm, idRolMaster: empleado?.idRolMaster || "" });
    setError("");
    setOk("");
  };

  const editar = (u) => {
    setForm({
      idUsuarioMaster: u.idUsuarioMaster,
      usuario: u.usuario || "",
      email_recuperacion: u.email_recuperacion || "",
      contrasena: "",
      idRolMaster: u.idRolMaster || "",
      tema: u.tema || "claro",
      activo: Number(u.activo) === 1 ? 1 : 0,
    });
    setError("");
    setOk("");
  };

  const guardar = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setOk("");

    try {
      const payload = {
        ...form,
        idUsuarioMaster: Number(form.idUsuarioMaster || 0),
        idRolMaster: Number(form.idRolMaster || 0),
        activo: Number(form.activo) === 1 ? 1 : 0,
      };
      if (esEdicion && !payload.contrasena) delete payload.contrasena;

      const res = await apiFetch(
        { action: "configuracion_usuarios_guardar" },
        { method: "POST", body: JSON.stringify(payload) }
      );
      const txt = await res.text();
      const data = safeJsonParse(txt);
      if (!res.ok || !data?.exito) throw new Error(data?.mensaje || "No se pudo guardar el usuario.");
      setOk(data.mensaje || "Usuario guardado correctamente.");
      limpiar();
      await cargar();
    } catch (e2) {
      setError(e2?.message || "Error guardando usuario.");
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (u) => {
    const nuevo = Number(u.activo) === 1 ? 0 : 1;
    setError("");
    setOk("");
    try {
      const res = await apiFetch(
        { action: "configuracion_usuarios_estado" },
        { method: "POST", body: JSON.stringify({ idUsuarioMaster: u.idUsuarioMaster, activo: nuevo }) }
      );
      const txt = await res.text();
      const data = safeJsonParse(txt);
      if (!res.ok || !data?.exito) throw new Error(data?.mensaje || "No se pudo cambiar el estado.");
      setOk(data.mensaje || "Estado actualizado.");
      await cargar();
    } catch (e) {
      setError(e?.message || "Error cambiando estado.");
    }
  };

  return (
    <section className="cfg-users-page">
      <div className="cfg-users-head">
        <div>
          <button className="cfg-users-back" type="button" onClick={() => navigate("/panel/configuracion")}>← Volver</button>
          <h1>Usuarios del sistema</h1>
          <p>Creá usuarios para empleados y asignales un rol. El empleado básico solo ve Movimientos, Perfil y modo claro/oscuro.</p>
        </div>
      </div>

      {error && <div className="cfg-users-alert cfg-users-alert--error">{error}</div>}
      {ok && <div className="cfg-users-alert cfg-users-alert--ok">{ok}</div>}

      <div className="cfg-users-grid">
        <form className="cfg-users-form" onSubmit={guardar}>
          <h2>{esEdicion ? "Editar usuario" : "Crear usuario"}</h2>

          <label>
            Usuario
            <input
              value={form.usuario}
              onChange={(e) => setForm((p) => ({ ...p, usuario: e.target.value }))}
              placeholder="Ej: empleado1"
              autoComplete="off"
            />
          </label>

          <label>
            Email de recuperación
            <input
              value={form.email_recuperacion}
              onChange={(e) => setForm((p) => ({ ...p, email_recuperacion: e.target.value }))}
              placeholder="opcional@correo.com"
              type="email"
            />
          </label>

          <label>
            Contraseña {esEdicion ? <span>(dejar vacía para no cambiar)</span> : null}
            <input
              value={form.contrasena}
              onChange={(e) => setForm((p) => ({ ...p, contrasena: e.target.value }))}
              placeholder={esEdicion ? "Nueva contraseña opcional" : "Mínimo 6 caracteres"}
              type="password"
              autoComplete="new-password"
            />
          </label>

          <label>
            Rol
            <select value={form.idRolMaster} onChange={(e) => setForm((p) => ({ ...p, idRolMaster: e.target.value }))}>
              {roles.map((r) => (
                <option key={r.idRolMaster} value={r.idRolMaster}>{r.nombre}</option>
              ))}
            </select>
          </label>

          <label>
            Tema inicial
            <select value={form.tema} onChange={(e) => setForm((p) => ({ ...p, tema: e.target.value }))}>
              <option value="claro">Claro</option>
              <option value="oscuro">Oscuro</option>
            </select>
          </label>

          <label>
            Estado
            <select value={form.activo} onChange={(e) => setForm((p) => ({ ...p, activo: Number(e.target.value) }))}>
              <option value={1}>Activo</option>
              <option value={0}>Inactivo</option>
            </select>
          </label>

          <div className="cfg-users-actions">
            <button className="cfg-users-btn cfg-users-btn--primary" type="submit" disabled={saving}>
              {saving ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear usuario"}
            </button>
            {esEdicion && (
              <button className="cfg-users-btn cfg-users-btn--ghost" type="button" onClick={limpiar}>Cancelar edición</button>
            )}
          </div>
        </form>

        <div className="cfg-users-list">
          <h2>Usuarios creados</h2>
          {loading ? (
            <div className="cfg-users-empty">Cargando usuarios...</div>
          ) : usuarios.length === 0 ? (
            <div className="cfg-users-empty">Todavía no hay usuarios.</div>
          ) : (
            <div className="cfg-users-tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Email</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => {
                    const rol = rolesById.get(Number(u.idRolMaster));
                    return (
                      <tr key={u.idUsuarioMaster}>
                        <td>{u.usuario}</td>
                        <td>{rol?.nombre || u.rol_nombre || u.rol}</td>
                        <td>{u.email_recuperacion || "-"}</td>
                        <td>
                          <span className={`cfg-users-pill ${Number(u.activo) === 1 ? "is-active" : "is-inactive"}`}>
                            {Number(u.activo) === 1 ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="cfg-users-rowActions">
                          <button type="button" onClick={() => editar(u)}>Editar</button>
                          <button type="button" onClick={() => cambiarEstado(u)}>
                            {Number(u.activo) === 1 ? "Desactivar" : "Activar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
