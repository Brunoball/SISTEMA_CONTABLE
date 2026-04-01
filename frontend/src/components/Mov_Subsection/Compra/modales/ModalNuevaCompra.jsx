import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar, faBasketShopping, faMoneyCheckDollar,
  faCircleNotch, faPlus, faTrash,
} from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";

const NULL_OPTION = "";

const IVA_OPTIONS = [
  { label: "0 %",    value: 0    },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %",   value: 21   },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function safeNumber(v) { const n=Number(v); return Number.isFinite(n)?n:0; }
function isBlank(v)    { return String(v??"").trim()===""; }
function safeText(v)   { const s=String(v??"").trim(); return s?s:"-"; }
function moneyARS(v) {
  try { return Number(v||0).toLocaleString("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2,maximumFractionDigits:2}); }
  catch { return `$${Number(v||0).toFixed(2)}`; }
}
function formatMoneyInputARS(v) {
  const n=safeNumber(v);
  try { return n.toLocaleString("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2,maximumFractionDigits:2}); }
  catch { return `$ ${n.toFixed(2)}`; }
}
function parseMoneyInputARS(v) {
  if(v==null) return 0;
  let s=String(v).trim(); if(!s) return 0;
  s=s.replace(/\$/g,"").replace(/\s+/g,"");
  if(s.includes(",")&&s.includes(".")) s=s.replace(/\./g,"").replace(",",".");
  else if(s.includes(",")) s=s.replace(",",".");
  const n=Number(s); return Number.isFinite(n)?n:0;
}
function formatEditableMoney(v) { const n=safeNumber(v); if(n===0) return ""; return String(n).replace(".","," ); }
function uid() { return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function getDetalleId(d)   { const c=d?.id??d?.id_detalle??d?.idDetalle??d?.detalle_id??null;  const n=Number(c); return Number.isFinite(n)&&n>0?n:null; }
function getProveedorId(p) { const c=p?.id??p?.id_proveedor??p?.idProveedor??p?.proveedor_id??null; const n=Number(c); return Number.isFinite(n)&&n>0?n:null; }
function getMedioPagoId(mp){ const c=mp?.id??mp?.id_medio_pago??mp?.medio_pago_id??mp?.idMedioPago??null; const n=Number(c); return Number.isFinite(n)&&n>0?n:null; }
function getStockDisponible(detalle) {
  const c=detalle?.stock??detalle?.stock_disponible??detalle?.stockDisponible??detalle?.cantidad_stock??detalle?.cantidad??null;
  if(c===null||c===undefined||c==="") return null;
  const n=Number(c); return Number.isFinite(n)?n:null;
}
function isSinStock(stock) { return stock!==null&&stock!==undefined&&Number(stock)<=0; }
function buildEmptyRow() {
  return { id:uid(), id_detalle:NULL_OPTION, detalleText:"", cantidad:1, precio:0, precioDraft:"", precioFocused:false, ivaPct:0, stock_disponible:null, sinStock:false };
}

/* ---------- Nuevo: línea de medio de pago vacía ---------- */
function buildEmptyMedioPago() {
  return { id: uid(), id_medio_pago: NULL_OPTION, monto: 0, montoDraft: "", montoFocused: false, id_cheque: [], chequesDisponibles: [], loadingCheques: false };
}

const SAFE_LISTS = { proveedores:[], detalles:[], medios_pago:[] };

function normalizeLists(lists) {
  const src=lists&&typeof lists==="object"?lists:{};
  const l=src.listas&&typeof src.listas==="object"?src.listas:src;
  const pick=(k)=>(Array.isArray(l?.[k])?l[k]:[]);
  const mediosPago=pick("medios_pago").length?pick("medios_pago"):pick("mediosPago").length?pick("mediosPago"):pick("medios").length?pick("medios"):pick("medios_de_pago");
  return { proveedores:pick("proveedores"), detalles:pick("detalles"), medios_pago:Array.isArray(mediosPago)?mediosPago:[] };
}

function getAuthInfo() {
  const sessionKey=localStorage.getItem("session_key")||localStorage.getItem("sessionKey")||localStorage.getItem("x_session")||localStorage.getItem("X-Session")||"";
  const token=localStorage.getItem("token")||"";
  let idUsuario=0;
  try { const u=JSON.parse(localStorage.getItem("usuario")||"null"); const c=u?.idUsuario??u?.id_usuario??u?.id??u?.user_id??0; if(Number.isFinite(Number(c))) idUsuario=Number(c); } catch {}
  return { token, sessionKey, idUsuario };
}
async function parseJsonOrThrow(res) {
  const text=await res.text();
  if(!text) throw new Error("Respuesta vacía del servidor.");
  try { const data=JSON.parse(text); if(!res.ok){ const msg=data?.mensaje||data?.error||`HTTP ${res.status}`; throw new Error(msg); } return data; }
  catch(e){ if(e instanceof Error) throw e; throw new Error(`Respuesta inválida. HTTP ${res.status}`); }
}
function buildAuthHeaders(isJson=true) {
  const { token, sessionKey }=getAuthInfo();
  const headers={};
  if(isJson) headers["Content-Type"]="application/json";
  if(sessionKey) headers["X-Session"]=sessionKey;
  if(token) headers.Authorization=`Bearer ${token}`;
  return headers;
}
async function apiGet(url)              { const res=await fetch(url,{method:"GET",headers:buildAuthHeaders(false)}); return await parseJsonOrThrow(res); }
async function apiPostJson(url,payload) { const res=await fetch(url,{method:"POST",headers:buildAuthHeaders(true),body:JSON.stringify(payload??{})}); return await parseJsonOrThrow(res); }
async function apiPostForm(url,fd)      { const res=await fetch(url,{method:"POST",headers:buildAuthHeaders(false),body:fd}); return await parseJsonOrThrow(res); }

function isTemaOscuro() { return document.documentElement.getAttribute("data-theme")==="oscuro"||document.body?.classList?.contains("dark"); }
function normalizeText(s) { return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }
function normalizeChequeTipoFromMedio(nombre) {
  const s=normalizeText(nombre); if(!s) return null;
  if(s.includes("echeq")||s.includes("e-cheq")||s.includes("e cheq")) return "echeq";
  if(s.includes("cheque")) return "cheque";
  return null;
}
function formatFechaDMY(v) {
  const s=String(v??"").trim(); if(!s) return "-";
  const m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return `${String(Number(m[3])).padStart(2,"0")}/${String(Number(m[2])).padStart(2,"0")}/${m[1]}`;
  return s;
}
function describeLineProblem(r,idx1based) {
  const detId=Number(r.id_detalle);
  const detTxt=String(r.detalleText||"").trim();
  const qtyBlank=isBlank(r.cantidad), priceBlank=isBlank(r.precio);
  const qty=safeNumber(r.cantidad), price=safeNumber(r.precio), total=safeNumber(r.total);
  const touched=detTxt!==""||String(r.id_detalle||"").trim()!==""||!qtyBlank||!priceBlank||safeNumber(r.cantidad)!==0||safeNumber(r.precio)!==0;
  if(!touched) return null;
  const issues=[];
  if(!(Number.isFinite(detId)&&detId>0)) issues.push(detTxt?`el detalle "${detTxt}" no está seleccionado`:"falta el detalle");
  if(qtyBlank) issues.push("falta la cantidad");
  else if(!(Number.isFinite(qty)&&qty>0)) issues.push("la cantidad debe ser > 0");
  if(priceBlank) issues.push("falta el precio");
  else if(!(Number.isFinite(price)&&price>0)) issues.push("el precio debe ser > 0");
  if(!(Number.isFinite(total)&&total>0)) issues.push("el total queda en 0");
  if(!issues.length) return null;
  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

/* ============================================================
   MINI-MODAL AGREGAR CATÁLOGO
============================================================ */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave, dark=false }) {
  const inputRef=useRef(null);
  useEffect(()=>{ if(!open) return; const t=setTimeout(()=>inputRef.current?.focus(),0); return()=>clearTimeout(t); },[open]);
  useEffect(()=>{ if(!open) return; const h=(e)=>{ if(e.key==="Escape") onCancel?.(); if(e.key==="Enter") onSave?.(); }; document.addEventListener("keydown",h); return()=>document.removeEventListener("keydown",h); },[open,onCancel,onSave]);
  if(!open) return null;
  return createPortal(
    <div className="mi-mini__overlay">
      <div className={["mi-mini__modal",dark?"mi-modal--dark":""].join(" ").trim()} onMouseDown={(e)=>e.stopPropagation()}>
        <div className="mi-mini__head">
          <h4 className="mi-mini__title">{title}</h4>
          <button type="button" className="mi-mini__close" onClick={onCancel} disabled={saving} aria-label="Cerrar">✕</button>
        </div>
        <div className="mi-mini__body">
          <div className="fl-field">
            <input ref={inputRef} className="fl-input" placeholder=" " value={value} onChange={(e)=>onChange?.(e.target.value)} disabled={saving} autoComplete="off"/>
            <label className="fl-label">Nombre</label>
          </div>
          <div className="mi-mini__actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="button" className="mit-btn mit-btn--solid" onClick={onSave} disabled={saving}>{saving?"Guardando...":"Guardar"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body  // ← CORRECTO: solo document.body, sin etiquetas
  );
}

/* ============================================================
   TARJETAS DE CHEQUES (multi-select con checkbox)
============================================================ */
function ChequesCarteraCards({ cheques, idsSeleccionados, onToggle }) {
  if (!cheques.length) return null;
  return (
    <div className="mpr-cheques-cards">
      {cheques.map((ch, idx) => {
        const checked = idsSeleccionados.includes(String(ch?.id_cheque));
        return (
          <div
            key={ch?.id_cheque||idx}
            className={`mpr-cheque-card-item ${checked?"is-checked":""}`}
            onClick={()=>onToggle(String(ch?.id_cheque||""))}
            style={{ border:checked?"1px solid #0f766e":"1px solid rgba(0,0,0,.08)", borderRadius:12, padding:10, cursor:"pointer", marginBottom:8, background:checked?"rgba(15,118,110,.06)":"transparent" }}
          >
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <input
                type="checkbox"
                checked={checked}
                onChange={()=>onToggle(String(ch?.id_cheque||""))}
                onClick={(e)=>e.stopPropagation()}
                style={{cursor:"pointer"}}
              />
              <span style={{fontWeight:700}}>N° {safeText(ch?.numero_cheque)}</span>
            </div>
            <div style={{display:"grid",gap:4}}>
              <div><b>Emisor:</b> {safeText(ch?.emisor)}</div>
              <div><b>F. emisión:</b> {safeText(formatFechaDMY(ch?.fecha_emision))}</div>
              <div><b>F. pago:</b> {safeText(formatFechaDMY(ch?.fecha_pago))}</div>
            </div>
            <div style={{marginTop:8,fontWeight:800,textAlign:"right"}}>{moneyARS(ch?.importe||0)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   COMPONENTE: UNA LÍNEA DE MEDIO DE PAGO (con botón completar restante)
============================================================ */
function MedioPagoRow({
  row, idx, mediosPagoList, totalCompra, sumaMediosPago, onUpdate, onRemove,
  saving, dark, showToast,
}) {
  const mpSeleccionado = useMemo(()=>
    mediosPagoList.find(x=>String(getMedioPagoId(x)??"")===String(row.id_medio_pago??"")||null)
  ,[mediosPagoList, row.id_medio_pago]);

  const tipoCheque = useMemo(()=>
    normalizeChequeTipoFromMedio(mpSeleccionado?.nombre||"")
  ,[mpSeleccionado]);

  const esCheque = tipoCheque !== null;

  // Cálculo del restante para esta fila específica
  const restanteParaEstaFila = useMemo(() => {
    // Suma de todos los medios de pago menos el monto actual
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - safeNumber(row.monto));
    // Lo que falta cubrir del total de la compra, considerando los otros medios
    return Math.max(0, safeNumber(totalCompra) - sumaOtros);
  }, [sumaMediosPago, totalCompra, row.monto]);

  const puedeCompletarRestante = 
    !saving && 
    !esCheque && 
    totalCompra > 0 && 
    restanteParaEstaFila > 0.009;

  // Cuando cambia el medio de pago, cargar cheques si aplica
  const handleChangeMedio = useCallback(async(val)=>{
    const mp = mediosPagoList.find(x=>String(getMedioPagoId(x)??"")===String(val));
    const tipo = normalizeChequeTipoFromMedio(mp?.nombre||"");

    onUpdate(row.id, { id_medio_pago: val, id_cheque: [], chequesDisponibles: [], loadingCheques: tipo!==null });

    if(tipo!==null){
      try {
        const sp=new URLSearchParams(); sp.set("action","compras_cheques_cartera_listar"); sp.set("tipo",tipo);
        const data=await apiGet(`${BASE_URL}/api.php?${sp.toString()}`);
        onUpdate(row.id,{ chequesDisponibles: Array.isArray(data?.cheques)?data.cheques:[], loadingCheques:false });
      } catch(e){
        onUpdate(row.id,{ chequesDisponibles:[], loadingCheques:false });
        showToast("error",e?.message||"No se pudieron cargar los cheques.",4000);
      }
    }
  },[row.id, mediosPagoList, onUpdate, showToast]);

  // Toggle cheque seleccionado (multi)
  const handleToggleCheque = useCallback((idChequeStr)=>{
    const current = Array.isArray(row.id_cheque) ? row.id_cheque : (row.id_cheque ? [row.id_cheque] : []);
    const next = current.includes(idChequeStr)
      ? current.filter(x=>x!==idChequeStr)
      : [...current, idChequeStr];
    onUpdate(row.id,{ id_cheque: next });
  },[row.id, row.id_cheque, onUpdate]);

  const chequesSeleccionados = Array.isArray(row.id_cheque) ? row.id_cheque : (row.id_cheque ? [String(row.id_cheque)] : []);

  // Monto: suma de cheques si es modo cheque y hay cheques seleccionados
  const importeCheques = useMemo(()=>{
    if(!esCheque||!chequesSeleccionados.length) return 0;
    return chequesSeleccionados.reduce((acc,idStr)=>{
      const ch=row.chequesDisponibles.find(x=>String(x.id_cheque)===idStr);
      return acc+(ch?Number(ch.importe||0):0);
    },0);
  },[esCheque, chequesSeleccionados, row.chequesDisponibles]);

  // Cuando se seleccionan cheques, el monto se llena automáticamente
  useEffect(()=>{
    if(esCheque && chequesSeleccionados.length>0){
      onUpdate(row.id, { monto: importeCheques });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[importeCheques, esCheque]);

  return (
    <div style={{ border:"1px solid rgba(0,0,0,.1)", borderRadius:10, padding:12, marginBottom:8, background: dark?"rgba(255,255,255,.03)":"rgba(0,0,0,.02)" }}>
      <div style={{display:"flex",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>

        {/* Selector de medio */}
        <div style={{flex:"1 1 160px"}}>
          <div style={{fontSize:11,fontWeight:600,marginBottom:4,color:"#666"}}>Medio de pago</div>
          <select
            className="fl-input fl-select"
            value={String(row.id_medio_pago||"")}
            onChange={(e)=>handleChangeMedio(e.target.value)}
            disabled={saving}
            style={{width:"100%"}}
          >
            <option value={NULL_OPTION}>Seleccionar...</option>
            {mediosPagoList.map(x=>{
              const idMp=getMedioPagoId(x);
              return <option key={idMp??x?.nombre??uid()} value={idMp!=null?String(idMp):""}>{String(x?.nombre??"").trim()||"Medio"}</option>;
            })}
          </select>
        </div>

        {/* Monto */}
        <div style={{flex:"1 1 110px"}}>
          <div style={{fontSize:11,fontWeight:600,marginBottom:4,color:"#666"}}>Monto</div>
          <input
            className="nv-cell-input nv-cell-input--right"
            type="text"
            inputMode="decimal"
            value={row.montoFocused ? (row.montoDraft??"") : formatMoneyInputARS(row.monto)}
            onFocus={(e)=>{ onUpdate(row.id,{montoFocused:true, montoDraft:formatEditableMoney(row.monto)}); setTimeout(()=>e.target.select(),0); }}
            onChange={(e)=>{ const raw=e.target.value; const c=raw.replace(/[^\d,.\-]/g,""); onUpdate(row.id,{montoDraft:c,monto:parseMoneyInputARS(c)}); }}
            onBlur={()=>{ const p=parseMoneyInputARS(row.montoDraft); onUpdate(row.id,{monto:p,montoDraft:"",montoFocused:false}); }}
            placeholder="$ 0,00"
            disabled={saving||(esCheque&&chequesSeleccionados.length>0)}
            style={{width:"100%", background:(esCheque&&chequesSeleccionados.length>0)?"#f3f4f6":undefined}}
            title={esCheque&&chequesSeleccionados.length>0?"El monto se calcula automáticamente de los cheques seleccionados":""}
          />

          {/* Botón "Completar restante" - SOLO PARA MEDIOS NO CHEQUE */}
          {!esCheque && (
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                onClick={() =>
                  onUpdate(row.id, {
                    monto: restanteParaEstaFila,
                    montoDraft: "",
                    montoFocused: false,
                  })
                }
                disabled={!puedeCompletarRestante}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  border: "1px solid #0f766e",
                  background: "transparent",
                  color: "#0f766e",
                  borderRadius: 6,
                  padding: "6px 8px",
                  cursor: puedeCompletarRestante ? "pointer" : "not-allowed",
                  opacity: puedeCompletarRestante ? 1 : 0.55,
                  width: "100%",
                }}
                title="Completa automáticamente el importe faltante"
              >
                Completar restante
              </button>
            </div>
          )}
        </div>

        {/* Botón eliminar fila */}
        <button
          type="button"
          onClick={()=>onRemove(row.id)}
          disabled={saving}
          style={{ marginTop:20, background:"none", border:"none", cursor:"pointer", color:"#dc2626", fontSize:18, padding:"0 4px" }}
          title="Quitar medio de pago"
        >×</button>
      </div>

      {/* Cheques disponibles */}
      {esCheque && (
        <div style={{marginTop:10}}>
          <div style={{fontSize:12,fontWeight:700,color:"#0f766e",marginBottom:6}}>
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{marginRight:5}}/>
            {tipoCheque==="echeq"?"eCheqs en cartera":"Cheques en cartera"} — seleccioná los que querés usar
          </div>

          {row.loadingCheques ? (
            <div style={{padding:"8px 0"}}>
              <FontAwesomeIcon icon={faCircleNotch} spin style={{marginRight:6}}/>
              Cargando...
            </div>
          ) : row.chequesDisponibles.length===0 ? (
            <div style={{padding:"8px 0",color:"#888",fontSize:13}}>
              No hay {tipoCheque==="echeq"?"eCheqs":"cheques"} activos en cartera.
            </div>
          ) : (
            <ChequesCarteraCards
              cheques={row.chequesDisponibles}
              idsSeleccionados={chequesSeleccionados}
              onToggle={handleToggleCheque}
            />
          )}

          {chequesSeleccionados.length>0 && (
            <div style={{marginTop:6,fontSize:12,fontWeight:700,color:"#0f766e"}}>
              ✓ {chequesSeleccionados.length} cheque(s) seleccionado(s) — Total: {moneyARS(importeCheques)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MODAL PRINCIPAL
============================================================ */
export default function ModalNuevaCompra({ open, lists, onClose, onToast, onSaved }) {
  const API_BATCH       = `${BASE_URL}/api.php?action=compras_crear_batch`;
  const API_UPLOAD_LINK = `${BASE_URL}/api.php?action=compras_comprobantes_vincular_movimientos_lote_upload`;

  const showToast = useCallback((tipo,mensaje,dur=2800)=>onToast?.(tipo,mensaje,dur),[onToast]);
  const [dark,setDark] = useState(isTemaOscuro);

  useEffect(()=>{
    const update=()=>setDark(isTemaOscuro());
    const o1=new MutationObserver(update); o1.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    const o2=new MutationObserver(update); if(document.body) o2.observe(document.body,{attributes:true,attributeFilter:["class"]});
    return()=>{ o1.disconnect(); o2.disconnect(); };
  },[]);

  useEffect(()=>{ if(!open) return; const p=document.body.style.overflow; document.body.style.overflow="hidden"; return()=>{ document.body.style.overflow=p; }; },[open]);
  useEffect(()=>{ if(!open) return; const h=(e)=>e.key==="Escape"&&onClose?.(); document.addEventListener("keydown",h); return()=>document.removeEventListener("keydown",h); },[open,onClose]);

  const [localLists,setLocalLists] = useState(()=>({...SAFE_LISTS,...normalizeLists(lists)}));
  useEffect(()=>setLocalLists({...SAFE_LISTS,...normalizeLists(lists)}),[lists]);

  const mediosPagoList  = useMemo(()=>Array.isArray(localLists.medios_pago)?localLists.medios_pago:[]  ,[localLists.medios_pago]);
  const detallesList    = useMemo(()=>Array.isArray(localLists.detalles)?localLists.detalles:[]          ,[localLists.detalles]);
  const proveedoresList = useMemo(()=>Array.isArray(localLists.proveedores)?localLists.proveedores:[]    ,[localLists.proveedores]);

  const [fecha,setFecha]       = useState(todayISO);
  const [forma,setForma]       = useState(NULL_OPTION);  // CONTADO | CUENTA_CORRIENTE
  const [idProveedor,setIdProveedor] = useState(NULL_OPTION);
  const [provInput,setProvInput]     = useState("");
  const [rows,setRows]               = useState(()=>[buildEmptyRow()]);
  const [saving,setSaving]           = useState(false);
  const [archivoAdjunto,setArchivoAdjunto] = useState(null);
  const [addUI,setAddUI] = useState({open:false,kind:null,rowId:null,text:"",saving:false});

  /* ── NUEVO: array de medios de pago ── */
  const [mediosFilas,setMediosFilas] = useState(()=>[buildEmptyMedioPago()]);

  const closeBtnRef        = useRef(null);
  const prevOpenRef        = useRef(false);
  const fechaInputRef      = useRef(null);
  const rowsContainerRef   = useRef(null);
  const [hasScroll,setHasScroll] = useState(false);

  // Reset al abrir
  useEffect(()=>{
    const wasOpen=prevOpenRef.current; prevOpenRef.current=open;
    if(!open) return;
    if(!wasOpen&&open){
      setFecha(todayISO()); setForma(NULL_OPTION); setIdProveedor(NULL_OPTION); setProvInput("");
      setRows([buildEmptyRow()]); setMediosFilas([buildEmptyMedioPago()]);
      setAddUI({open:false,kind:null,rowId:null,text:"",saving:false});
      setSaving(false); setArchivoAdjunto(null);
      setTimeout(()=>closeBtnRef.current?.focus(),0);
    }
  },[open]);

  useEffect(()=>{
    const el=rowsContainerRef.current; if(!el) return;
    const check=()=>setHasScroll(el.scrollHeight>el.clientHeight+1);
    check();
    const ro=new ResizeObserver(check); ro.observe(el);
    window.addEventListener("resize",check);
    return()=>{ ro.disconnect(); window.removeEventListener("resize",check); };
  },[open,rows]);

  const isContado   = String(forma)==="CONTADO";
  const isCorriente = String(forma)==="CUENTA_CORRIENTE";

  // Limpia medios de pago cuando cambia a cuenta corriente
  useEffect(()=>{
    if(isCorriente) setMediosFilas([buildEmptyMedioPago()]);
  },[isCorriente]);

  /* ── Helpers filas de productos ── */
  const addRow    = useCallback(()=>setRows(p=>[...p,buildEmptyRow()]),[]);
  const removeRow = useCallback((id)=>setRows(p=>{ const n=p.filter(r=>r.id!==id); return n.length?n:p; }),[]);
  const updateRow = useCallback((id,patch)=>setRows(p=>p.map(r=>r.id===id?{...r,...patch}:r)),[]);

  /* ── Helpers medios de pago ── */
  const addMedioPago    = useCallback(()=>setMediosFilas(p=>[...p,buildEmptyMedioPago()]),[]);
  const removeMedioPago = useCallback((id)=>setMediosFilas(p=>{ const n=p.filter(r=>r.id!==id); return n.length?n:p; }),[]);
  const updateMedioPago = useCallback((id,patch)=>setMediosFilas(p=>p.map(r=>r.id===id?{...r,...patch}:r)),[]);

  /* ── Proveedor ── */
  const handleProveedorInputChange = useCallback((val)=>{ setProvInput(val); setIdProveedor(NULL_OPTION); },[]);
  const handleSelectProveedor      = useCallback((prov)=>{ setProvInput(String(prov?.nombre??"").trim()); setIdProveedor(getProveedorId(prov)!=null?String(getProveedorId(prov)):NULL_OPTION); },[]);

  /* ── Detalle row ── */
  const handleSelectDetalle = useCallback((detalle,rowId)=>{
    const precio=Number(detalle?.precio||0);
    const stockDisponible=getStockDisponible(detalle);
    const sinStock=isSinStock(stockDisponible);
    updateRow(rowId,{id_detalle:String(getDetalleId(detalle)||""),detalleText:detalle?.nombre||"",precio,stock_disponible:stockDisponible,sinStock,cantidad:sinStock?"":1});
    if(sinStock) showToast("advertencia",`El producto "${detalle?.nombre||""}" no tiene stock disponible.`,2500);
  },[updateRow,showToast]);

  const handleCantidadChange = useCallback((rowId,newCantidad)=>{
    const row=rows.find(r=>r.id===rowId); if(!row) return;
    if(row.sinStock||isSinStock(row.stock_disponible)){ updateRow(rowId,{cantidad:""}); return; }
    const stockDisponible=row.stock_disponible;
    let cantidadFinal=newCantidad===""?"":Number(newCantidad);
    if(typeof cantidadFinal==="number"&&cantidadFinal<0) cantidadFinal=0;
    if(stockDisponible!==null&&stockDisponible!==undefined&&stockDisponible!==""&&typeof cantidadFinal==="number"&&cantidadFinal>Number(stockDisponible)){
      cantidadFinal=Number(stockDisponible);
      showToast("advertencia",`Stock máximo disponible: ${stockDisponible}`,2000);
    }
    updateRow(rowId,{cantidad:cantidadFinal});
  },[rows,updateRow,showToast]);

  /* ── Add proveedor mini modal ── */
  const startAddProveedor = useCallback(()=>{ if(saving) return; setAddUI({open:true,kind:"proveedores",rowId:null,text:provInput||"",saving:false}); },[saving,provInput]);
  const closeAddMini      = useCallback(()=>{ if(addUI.saving) return; setAddUI({open:false,kind:null,rowId:null,text:"",saving:false}); },[addUI.saving]);

  const guardarNuevoCatalogo = useCallback(async()=>{
    const nombre=String(addUI.text||"").trim();
    if(!nombre){ showToast("advertencia","Escribí un nombre antes de guardar.",2600); return; }
    const kind=addUI.kind; if(!kind) return;
    setAddUI(p=>({...p,saving:true}));
    showToast("cargando",`Creando ${kind==="detalles"?"detalle":"proveedor"}…`,12000);
    try {
      const { idUsuario }=getAuthInfo();
      const data=await apiPostJson(`${BASE_URL}/api.php?action=catalogo_crear`,{catalogo:kind,nombre,idUsuario});
      if(!data?.exito) throw new Error(data?.mensaje||"No se pudo crear.");
      const item=data?.item??{};
      const newId=kind==="detalles"?getDetalleId(item)??Number(item?.id):getProveedorId(item)??Number(item?.id);
      const newNombre=String(item?.nombre??"").trim()||nombre;
      if(!Number.isFinite(Number(newId))||Number(newId)<=0) throw new Error("El servidor no devolvió un ID válido.");
      setLocalLists(prev=>{
        const next={...prev};
        const arr=Array.isArray(prev[kind])?prev[kind].slice():[];
        const already=arr.some(x=>{ const xid=kind==="detalles"?getDetalleId(x):getProveedorId(x); return Number(xid)===Number(newId); });
        if(!already) arr.push({id:Number(newId),nombre:newNombre});
        next[kind]=arr; return next;
      });
      if(kind==="proveedores"){ setIdProveedor(String(newId)); setProvInput(newNombre); }
      setAddUI({open:false,kind:null,rowId:null,text:"",saving:false});
      showToast("exito",`${kind==="detalles"?"Detalle":"Proveedor"} creado: "${newNombre}"`,2600);
    } catch(e){
      setAddUI(p=>({...p,saving:false}));
      showToast("error",e?.message||"Error creando.",4200);
    }
  },[addUI,showToast]);

  /* ── Cálculos ── */
  const rowsCalc = useMemo(()=>rows.map(r=>{
    const cantidad=Math.max(0,safeNumber(r.cantidad));
    const precio=Math.max(0,safeNumber(r.precio));
    const ivaPct=Math.max(0,safeNumber(r.ivaPct));
    const subtotal=cantidad*precio;
    const ivaMonto=subtotal*(ivaPct/100);
    const total=subtotal+ivaMonto;
    return {...r,subtotal,ivaMonto,total};
  }),[rows]);

  const resumen = useMemo(()=>({
    subtotal:rowsCalc.reduce((a,r)=>a+(r.subtotal||0),0),
    iva:rowsCalc.reduce((a,r)=>a+(r.ivaMonto||0),0),
    total:rowsCalc.reduce((a,r)=>a+(r.total||0),0),
  }),[rowsCalc]);

  /* ── Suma de medios de pago ── */
  const sumaMediosPago = useMemo(()=>
    mediosFilas.reduce((a,r)=>a+safeNumber(r.monto),0)
  ,[mediosFilas]);

  const diferenciaRestante = useMemo(()=>
    Math.max(0, resumen.total - sumaMediosPago)
  ,[resumen.total, sumaMediosPago]);

  /* ── Fecha ── */
  const handleOpenDate = useCallback((e)=>{
    if(saving) return;
    if(e){ e.preventDefault(); e.stopPropagation(); }
    const input=fechaInputRef.current; if(!input) return;
    input.focus();
    try { if(typeof input.showPicker==="function") input.showPicker(); else input.click(); } catch { input.click(); }
  },[saving]);

  /* ── Validación ── */
  const validate = useCallback(()=>{
    const provId=Number(idProveedor);
    const provTxt=String(provInput||"").trim();
    if(!((Number.isFinite(provId)&&provId>0)||provTxt.length>0))
      return { ok:false, msg:"Falta seleccionar un Proveedor (obligatorio)." };

    if(!["CONTADO","CUENTA_CORRIENTE"].includes(String(forma)))
      return { ok:false, msg:"Falta seleccionar el Tipo de compra (Contado / Cuenta Corriente)." };

    if(isContado){
      // Validar medios de pago
      for(let i=0;i<mediosFilas.length;i++){
        const mp=mediosFilas[i];
        if(!mp.id_medio_pago||mp.id_medio_pago===NULL_OPTION)
          return { ok:false, msg:`Medio de pago ${i+1}: falta seleccionar el medio.` };
        if(safeNumber(mp.monto)<=0)
          return { ok:false, msg:`Medio de pago ${i+1}: el monto debe ser mayor a 0.` };

        // Cheque: debe tener al menos 1 seleccionado
        const mpRow=mediosPagoList.find(x=>String(getMedioPagoId(x)??"")===String(mp.id_medio_pago));
        const tipoCheque=normalizeChequeTipoFromMedio(mpRow?.nombre||"");
        if(tipoCheque!==null){
          const seleccionados=Array.isArray(mp.id_cheque)?mp.id_cheque:(mp.id_cheque?[String(mp.id_cheque)]:[]);
          if(!seleccionados.length)
            return { ok:false, msg:`Medio de pago ${i+1}: debés seleccionar al menos un ${tipoCheque==="echeq"?"eCheq":"cheque"} en cartera.` };
        }
      }

      // Advertir si la suma no cubre el total (pero no bloquear por diferencia)
      if(sumaMediosPago<(resumen.total-0.05)&&resumen.total>0)
        return { ok:false, msg:`La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no cubre el total de la compra (${moneyARS(resumen.total)}).` };
    }

    const problems=[]; rowsCalc.forEach((r,i)=>{ const p=describeLineProblem(r,i+1); if(p) problems.push(p); });
    const usable=rowsCalc.filter(r=>Number.isFinite(Number(r.id_detalle))&&Number(r.id_detalle)>0&&Number(r.total||0)>0);

    if(!usable.length){
      if(problems.length){ const msg=problems.slice(0,2).join(" "); const extra=problems.length>2?` (y ${problems.length-2} más)`:""; return { ok:false, msg:`No hay filas válidas. ${msg}${extra}` }; }
      return { ok:false, msg:"Cargá al menos 1 fila válida (Detalle + Cantidad + Precio)." };
    }

    return { ok:true, warn:problems.length>0 };
  },[idProveedor,provInput,forma,isContado,mediosFilas,mediosPagoList,rowsCalc,resumen.total,sumaMediosPago]);

  /* ── Upload archivo ── */
  const subirYVincularArchivo = useCallback(async(idsMovimientos,archivo)=>{
    if(!archivo||!idsMovimientos?.length) return null;
    const fd=new FormData(); fd.append("archivo",archivo); fd.append("tipo","FACTURA"); fd.append("force","0"); fd.append("ids_movimiento",JSON.stringify(idsMovimientos));
    return await apiPostForm(API_UPLOAD_LINK,fd);
  },[API_UPLOAD_LINK]);

  /* ── Submit ── */
  const submit = useCallback(async()=>{
    if(saving) return;
    const { sessionKey }=getAuthInfo();
    if(!sessionKey){ showToast("error","No hay sesión activa (Falta X-Session).",5200); return; }
    if(addUI.open){ showToast("advertencia","Terminá de crear (o cancelá) antes de guardar.",3200); return; }
    const v=validate();
    if(!v.ok){ showToast("advertencia",v.msg||"Faltan datos.",4200); return; }
    setSaving(true);
    if(v.warn) showToast("advertencia","Hay filas incompletas: se guardarán solo las válidas.",3600);

    try {
      const { idUsuario }=getAuthInfo();
      const idTipoVenta=isCorriente?2:1;
      const accionFinal=isCorriente?"guardar":"pagar";
      const esPagadaFinal=!isCorriente;
      const proveedorIdFinal=Number(idProveedor)>0?Number(idProveedor):null;

      // Construir medios_pago para el backend
      const mediosPagoPayload = isContado
        ? mediosFilas.flatMap(mp=>{
            const chequesSeleccionados=Array.isArray(mp.id_cheque)?mp.id_cheque:(mp.id_cheque?[String(mp.id_cheque)]:[]);
            const mpRow=mediosPagoList.find(x=>String(getMedioPagoId(x)??"")===String(mp.id_medio_pago));
            const tipoCheque=normalizeChequeTipoFromMedio(mpRow?.nombre||"");

            if(tipoCheque!==null&&chequesSeleccionados.length>0){
              // Un registro por cheque
              return chequesSeleccionados.map(idChequeStr=>{
                const ch=mp.chequesDisponibles.find(x=>String(x.id_cheque)===idChequeStr);
                return { id_medio_pago:Number(mp.id_medio_pago), monto:Number(ch?.importe||0), id_cheque:Number(idChequeStr) };
              });
            }
            return [{ id_medio_pago:Number(mp.id_medio_pago), monto:safeNumber(mp.monto) }];
          })
        : [];

      const payloads = rowsCalc
        .filter(r=>Number.isFinite(Number(r.id_detalle))&&Number(r.id_detalle)>0&&Number(r.total||0)>0)
        .map(r=>({
          idUsuario, fecha,
          id_tipo_venta:idTipoVenta,
          id_proveedor:proveedorIdFinal,
          proveedor_nombre:String(provInput||"").trim()||null,
          id_detalle:Number(r.id_detalle),
          cantidad:Math.round(Number(r.cantidad)*100)/100,
          precio:Math.round(Number(r.precio)*100)/100,
          iva_pct:Math.round(Number(r.ivaPct)*100)/100,
          subtotal:Math.round(Number(r.subtotal)*100)/100,
          iva_monto:Math.round(Number(r.ivaMonto)*100)/100,
          total:Math.round(Number(r.total)*100)/100,
          monto_total:Math.round(Number(r.total)*100)/100,
          accion_compra:accionFinal,
          es_pagada:esPagadaFinal,
        }));

      if(!payloads.length){ showToast("advertencia","No hay filas válidas para guardar.",4200); setSaving(false); return; }

      // Enviar en formato B: { items: [...], medios_pago: [...] }
      const batchPayload = { items: payloads, medios_pago: mediosPagoPayload };

      const data=await apiPostJson(API_BATCH, batchPayload);
      if(!data?.exito) throw new Error(data?.mensaje||"No se pudo guardar el batch de compras.");

      const idsCreados=Array.isArray(data?.ids)?data.ids.map(x=>Number(x)).filter(x=>Number.isFinite(x)&&x>0):[];

      let warningArchivo="";
      if(archivoAdjunto&&idsCreados.length>0){
        try { const rFile=await subirYVincularArchivo(idsCreados,archivoAdjunto); if(!rFile?.exito) warningArchivo=rFile?.mensaje||"No se pudo vincular el archivo."; }
        catch(e){ warningArchivo=e?.message||"No se pudo vincular el archivo."; }
      }

      if(warningArchivo) showToast("advertencia",`Compra guardada, pero el archivo no se pudo vincular: ${warningArchivo}`,7000);
      else showToast("exito","Compra agregada correctamente.",3000);

      await Promise.resolve(onSaved?.(data));
      onClose?.();

    } catch(e){
      showToast("error",e?.message||"Error guardando.",4500);
      setSaving(false);
    }
  },[saving,addUI.open,validate,showToast,isCorriente,isContado,rowsCalc,fecha,idProveedor,provInput,mediosFilas,mediosPagoList,API_BATCH,onSaved,onClose,archivoAdjunto,subirYVincularArchivo]);

  if(!open) return null;

  return createPortal(
    <>
      <div className={["mi-modal__overlay",dark?"mi-modal__overlay--dark":""].join(" ").trim()}>
        <div
          className={["mi-modal__container","mi-modal__container--mov",dark?"mi-modal--dark":""].join(" ").trim()}
          role="dialog" aria-modal="true"
          onMouseDown={(e)=>e.stopPropagation()}
        >
          {/* HEADER */}
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true"><FontAwesomeIcon icon={faBasketShopping}/></div>
            <div className="mi-modal__head-left"><h2 className="mi-modal__title">Nueva Compra</h2></div>
            <button ref={closeBtnRef} className="mi-modal__close" onClick={()=>!saving&&onClose?.()} aria-label="Cerrar" disabled={saving} type="button">✕</button>
          </div>

          <div className="mi-modal__content">
            <div className="mi-cr-grid">

              {/* ── TABLA DE PRODUCTOS ── */}
              <section className="mi-cr-table">
                <div className="mi-cr-table__head">
                  <div style={{paddingLeft:10}}>Detalle</div>
                  <div>Cant.</div>
                  <div className="right">Precio</div>
                  <div>IVA %</div>
                  <div className="right">IVA $</div>
                  <div className="right">Total</div>
                  <div/>
                </div>

                <div ref={rowsContainerRef} className={`mi-cr-table__rows ${hasScroll?"has-scroll":""}`}>
                  {rowsCalc.map(r=>{
                    const stockNum=r.stock_disponible!==null&&r.stock_disponible!==undefined?Number(r.stock_disponible):null;
                    const rowSinStock=r.sinStock||isSinStock(stockNum);
                    return (
                      <div key={r.id} className={`mi-cr-row ${rowSinStock?"mi-cr-row--sin-stock":""}`}>
                        <div className="mi-cr-cell mi-cr-cell--detalle">
                          <GlobalAutocomplete
                            value={r.detalleText}
                            onChange={(val)=>updateRow(r.id,{detalleText:val,id_detalle:NULL_OPTION,stock_disponible:null,sinStock:false})}
                            onSelect={(d)=>handleSelectDetalle(d,r.id)}
                            options={detallesList}
                            getOptionLabel={(d)=>String(d?.nombre??"").trim()}
                            getOptionValue={(d)=>String(getDetalleId(d)??d?.nombre??"")}
                            placeholder="Escribí o buscá un detalle…"
                            disabled={saving||addUI.open}
                            showAllOnFocus={false} maxItems={18} inputClassName="nv-cell-input"
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center stock_cant">
                          <input
                            className="nv-cell-input nv-cell-input--center"
                            type="number" min={rowSinStock?undefined:"1"} step="1"
                            value={rowSinStock?"":r.cantidad}
                            onChange={(e)=>handleCantidadChange(r.id,e.target.value===""?"":Number(e.target.value))}
                            disabled={saving||rowSinStock}
                            placeholder={rowSinStock?"0":""}
                            title={rowSinStock?"No podés ingresar cantidad porque el stock es 0":""}
                            style={{width:"100%",background:rowSinStock?"#f3f4f6":undefined,color:rowSinStock?"#b91c1c":undefined,borderColor:rowSinStock?"#fca5a5":undefined,cursor:rowSinStock?"not-allowed":undefined,opacity:rowSinStock?0.9:1}}
                          />
                          {r.stock_disponible!==null&&r.stock_disponible!==undefined&&(
                            <div style={{fontSize:"10px",fontWeight:rowSinStock?700:500,color:rowSinStock?"#b91c1c":"#666"}}>
                              {rowSinStock?"Sin stock":`Stock: ${r.stock_disponible}`}
                            </div>
                          )}
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <input
                            className="nv-cell-input nv-cell-input--right" type="text" inputMode="decimal"
                            value={r.precioFocused?r.precioDraft??"":formatMoneyInputARS(r.precio)}
                            onFocus={(e)=>{ updateRow(r.id,{precioFocused:true,precioDraft:formatEditableMoney(r.precio)}); setTimeout(()=>e.target.select(),0); }}
                            onChange={(e)=>{ const raw=e.target.value; const c=raw.replace(/[^\d,.\-]/g,""); updateRow(r.id,{precioDraft:c,precio:parseMoneyInputARS(c)}); }}
                            onBlur={()=>{ const p=parseMoneyInputARS(r.precioDraft); updateRow(r.id,{precio:p,precioDraft:"",precioFocused:false}); }}
                            placeholder="$ 0,00" disabled={saving} style={{width:"100%"}}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <select
                            className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                            value={String(r.ivaPct)}
                            onChange={(e)=>updateRow(r.id,{ivaPct:Number(e.target.value)})}
                            onKeyDown={(e)=>{ if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault(); }}
                            disabled={saving} style={{width:"100%"}}
                          >
                            {IVA_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
                          </select>
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">{moneyARS(r.ivaMonto)}</div>
                        <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">{moneyARS(r.total)}</div>
                        <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                          <button type="button" className="mi-cr-del" onClick={()=>removeRow(r.id)} disabled={saving} title="Eliminar fila">×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mi-cr-table__foot">
                  <div className="mi-cr-foot-actions">
                    <button type="button" className="nv-foot-btn" onClick={addRow} disabled={saving}>
                      <span className="nv-foot-btn__icon">+</span>Agregar fila
                    </button>
                    <div className="nv-foot-sep"/>
                  </div>
                  <div className="mi-cr-totals">
                    <div className="mi-cr-totalLine mi-cr-totalLine--sub"><span>Subtotal</span><b>{moneyARS(resumen.subtotal)}</b></div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--iva"><span>IVA</span><b>{moneyARS(resumen.iva)}</b></div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--total"><span>Total</span><b>{moneyARS(resumen.total)}</b></div>
                  </div>
                </div>
              </section>

              {/* ── PANEL LATERAL ── */}
              <aside className="mi-cr-filters">
                <div className="mi-cr-filters__top">
                  <div className="mi-cr-filters__title">Datos de compra</div>
                  <div className="mi-cr-filters__dates">
                    <div className="fl-field mi-card--full mi-date-field" onClick={handleOpenDate}>
                      <input ref={fechaInputRef} className="fl-input mi-date-field__input" type="date" placeholder=" " value={fecha} onChange={(e)=>setFecha(String(e.target.value||"").trim())} disabled={saving}/>
                      <label className="fl-label mi-date-field__label" onClick={handleOpenDate}>Fecha</label>
                    </div>
                  </div>
                </div>

                <div className="mi-cr-filters__body">
                  {/* Proveedor */}
                  <div className="fl-field mi-cr-rel">
                    <GlobalAutocomplete
                      value={provInput} onChange={handleProveedorInputChange} onSelect={handleSelectProveedor}
                      options={proveedoresList} getOptionLabel={(p)=>String(p?.nombre??"").trim()} getOptionValue={(p)=>String(getProveedorId(p)??p?.nombre??"")}
                      label="Proveedor *" placeholder=" " disabled={saving||addUI.open} showAllOnFocus={true} maxItems={25} inputClassName="fl-input"
                    />
                    <button type="button" className="mi-cr-link" onClick={startAddProveedor} disabled={saving||addUI.saving}
                      style={{fontSize:"11px",color:"#0f766e",background:"none",border:"none",padding:"4px 0 0",cursor:"pointer",fontWeight:500}}>
                      + Agregar nuevo proveedor
                    </button>
                  </div>

                  {/* Tipo de compra */}
                  <div className="fl-field">
                    <select className="fl-input fl-select" value={String(forma)} onChange={(e)=>setForma(e.target.value)} disabled={saving}>
                      <option value={NULL_OPTION}>Seleccionar...</option>
                      <option value="CONTADO">CONTADO</option>
                      <option value="CUENTA_CORRIENTE">CUENTA CORRIENTE</option>
                    </select>
                    <label className="fl-label">Tipo de compra *</label>
                  </div>

                  {/* ── MEDIOS DE PAGO MÚLTIPLES (solo CONTADO) ── */}
                  {isContado && (
                    <div className="mi-card mi-card--full" style={{marginTop:8}}>
                      <div className="mi-card__title" style={{marginBottom:10}}>
                        <FontAwesomeIcon icon={faMoneyCheckDollar} style={{marginRight:6}}/>
                        Medios de pago
                      </div>

                      {mediosFilas.map((mp,idx)=>(
                        <MedioPagoRow
                          key={mp.id}
                          row={mp} idx={idx}
                          mediosPagoList={mediosPagoList}
                          totalCompra={resumen.total}
                          sumaMediosPago={sumaMediosPago}
                          onUpdate={updateMedioPago}
                          onRemove={removeMedioPago}
                          saving={saving} dark={dark}
                          showToast={showToast}
                        />
                      ))}

                      {/* Totalizador medios de pago */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8,paddingTop:8,borderTop:"1px solid rgba(0,0,0,.08)",fontSize:13}}>
                        <span style={{color:"#666"}}>Asignado: <b>{moneyARS(sumaMediosPago)}</b></span>
                        {diferenciaRestante>0.01 && (
                          <span style={{color:"#dc2626",fontWeight:700}}>Falta: {moneyARS(diferenciaRestante)}</span>
                        )}
                        {diferenciaRestante<=0.01 && resumen.total>0 && (
                          <span style={{color:"#0f766e",fontWeight:700}}>✓ Cubierto</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={addMedioPago}
                        disabled={saving}
                        style={{marginTop:10,display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#0f766e",background:"none",border:"1px dashed #0f766e",borderRadius:8,padding:"6px 12px",cursor:"pointer",width:"100%",justifyContent:"center",fontWeight:600}}
                      >
                        <FontAwesomeIcon icon={faPlus}/> Agregar otro medio de pago
                      </button>
                    </div>
                  )}

                  {/* Cuenta corriente info */}
                  {isCorriente && (
                    <div className="mi-card mi-card--full">
                      <div className="mi-card__title">Cuenta Corriente</div>
                      <div className="mi-card__hint">* Se guardará como <b>Cuenta Corriente</b> y quedará <b>pendiente</b>.</div>
                    </div>
                  )}

                  {/* Archivo adjunto */}
                  <div className="mi-uploadCard">
                    <div className="mi-uploadCard__head">
                      <div>
                        <div className="mi-uploadCard__title">Archivo adjunto</div>
                        <div className="mi-uploadCard__sub">PDF, imagen u otro comprobante</div>
                      </div>
                    </div>
                    <div className="mi-uploadCard__body">
                      <div className="mi-uploadBar">
                        <label className="mi-uploadBar__pick">
                          <input type="file" className="mi-uploadBar__input" onChange={(e)=>setArchivoAdjunto(e.target.files?.[0]||null)} disabled={saving}/>
                          <span className="mi-uploadBar__btn mi-uploadBar__btn--primary">{archivoAdjunto?"Cambiar":"Seleccionar"}</span>
                        </label>
                        <button type="button" className="mi-uploadBar__btn mi-uploadBar__btn--ghost" onClick={()=>setArchivoAdjunto(null)} disabled={saving||!archivoAdjunto}>Quitar</button>
                      </div>
                      <div className={`mi-uploadFile ${archivoAdjunto?"is-filled":"is-empty"}`}>
                        {archivoAdjunto ? (
                          <><div className="mi-uploadFile__icon"><FontAwesomeIcon icon={faFileInvoiceDollar}/></div>
                          <div className="mi-uploadFile__meta">
                            <div className="mi-uploadFile__name" title={archivoAdjunto.name}>{archivoAdjunto.name}</div>
                            <div className="mi-uploadFile__size">{Math.max(1,Math.round((archivoAdjunto.size||0)/1024))} KB</div>
                          </div></>
                        ) : <div className="mi-uploadFile__empty">No hay archivo seleccionado</div>}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="mi-cr-filters__actions">
                    <button type="button" onClick={submit} disabled={saving} className="mit-btn mit-btn--solid mit-btn--block">
                      {saving?"Guardando...":"Guardar compra"}
                    </button>
                    <button type="button" onClick={()=>!saving&&onClose?.()} disabled={saving} className="mit-btn mit-btn--ghost mit-btn--block">
                      Cancelar
                    </button>
                  </div>
                </div>
              </aside>

            </div>
          </div>

          <AddCatalogMiniModal
            open={addUI.open} title={addUI.kind==="proveedores"?"Nuevo proveedor":"Nuevo detalle"}
            value={addUI.text} saving={addUI.saving}
            onChange={(txt)=>setAddUI(p=>({...p,text:txt}))}
            onCancel={closeAddMini} onSave={guardarNuevoCatalogo} dark={dark}
          />
        </div>
      </div>
    </>,
    document.body
  );
}