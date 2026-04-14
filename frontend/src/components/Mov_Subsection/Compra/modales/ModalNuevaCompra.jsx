import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import {
  faFileInvoiceDollar,
  faBasketShopping,
  faCircleNotch,
  faEye,
  faUpload,
  faTrash,
  faCreditCard,
} from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import { ModalMediosPago, PagoResumenPanel, buildEmptyMedioPago } from "./Modalmediospago.jsx";

const NULL_OPTION = "";

const IVA_OPTIONS = [
  { label: "0 %",    value: 0    },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %",   value: 21   },
];

/* ── Helpers ── */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function safeNumber(v) { const n=Number(v); return Number.isFinite(n)?n:0; }
function isBlank(v)    { return String(v??"").trim()===""; }
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
function formatEditableMoney(v) { const n=safeNumber(v); if(n===0) return ""; return String(n).replace(".",","); }
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

const SAFE_LISTS = { proveedores:[], detalles:[], medios_pago:[] };
function normalizeLists(lists) {
  const src=lists&&typeof lists==="object"?lists:{};
  const l=src.listas&&typeof src.listas==="object"?src.listas:src;
  const pick=(k)=>(Array.isArray(l?.[k])?l[k]:[]);
  const mediosPago=pick("medios_pago").length?pick("medios_pago"):pick("mediosPago").length?pick("mediosPago"):pick("medios").length?pick("medios"):pick("medios_de_pago");
  return { proveedores:pick("proveedores"), detalles:pick("detalles"), medios_pago:Array.isArray(mediosPago)?mediosPago:[] };
}

function normalizeChequeTipoFromMedio(nombre) {
  const s=String(nombre||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
  if(!s) return null;
  if(s.includes("echeq")||s.includes("e-cheq")||s.includes("e cheq")) return "echeq";
  if(s.includes("cheque")) return "cheque";
  return null;
}

/* ── Auth ── */
function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") || "";
  const token = localStorage.getItem("token") || "";
  let idUsuario = 0, idUsuarioMaster = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const candMaster = u?.idUsuarioMaster ?? u?.id_usuario_master ?? 0;
    const candUser   = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? candMaster ?? 0;
    if(Number.isFinite(Number(candMaster))&&Number(candMaster)>0) idUsuarioMaster=Number(candMaster);
    if(Number.isFinite(Number(candUser))&&Number(candUser)>0)     idUsuario=Number(candUser);
    if(!idUsuario&&idUsuarioMaster) idUsuario=idUsuarioMaster;
    if(!idUsuarioMaster&&idUsuario) idUsuarioMaster=idUsuario;
  } catch {}
  return { token, sessionKey, idUsuario, idUsuarioMaster };
}

async function parseJsonOrThrow(res) {
  const text=await res.text();
  if(!text) throw new Error("Respuesta vacía del servidor.");
  try { const data=JSON.parse(text); if(!res.ok){ throw new Error(data?.mensaje||data?.error||`HTTP ${res.status}`); } return data; }
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

/* ── AddCatalogMiniModal ── */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave }) {
  const inputRef=useRef(null);
  useEffect(()=>{ if(!open) return; const t=setTimeout(()=>inputRef.current?.focus(),0); return()=>clearTimeout(t); },[open]);
  useEffect(()=>{ if(!open) return; const h=(e)=>{ if(e.key==="Escape") onCancel?.(); if(e.key==="Enter") onSave?.(); }; document.addEventListener("keydown",h); return()=>document.removeEventListener("keydown",h); },[open,onCancel,onSave]);
  if(!open) return null;
  return createPortal(
    <div className="mi-mini__overlay">
      <div className="mi-mini__modal" onMouseDown={(e)=>e.stopPropagation()}>
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
    document.body
  );
}

/* ============================================================
   MODAL PRINCIPAL
============================================================ */
export default function ModalNuevaCompra({ open, lists, onClose, onToast, onSaved }) {
  const API_BATCH       = `${BASE_URL}/api.php?action=compras_crear_batch`;
  const API_UPLOAD_LINK = `${BASE_URL}/api.php?action=compras_comprobantes_vincular_movimientos_lote_upload`;

  const showToast = useCallback((tipo,mensaje,dur=2800)=>onToast?.(tipo,mensaje,dur),[onToast]);

  useEffect(()=>{ if(!open) return; const p=document.body.style.overflow; document.body.style.overflow="hidden"; return()=>{ document.body.style.overflow=p; }; },[open]);
  useEffect(()=>{ if(!open) return; const h=(e)=>e.key==="Escape"&&onClose?.(); document.addEventListener("keydown",h); return()=>document.removeEventListener("keydown",h); },[open,onClose]);

  const [localLists,setLocalLists] = useState(()=>({...SAFE_LISTS,...normalizeLists(lists)}));
  useEffect(()=>setLocalLists({...SAFE_LISTS,...normalizeLists(lists)}),[lists]);

  const mediosPagoList  = useMemo(()=>Array.isArray(localLists.medios_pago)?localLists.medios_pago:[]   ,[localLists.medios_pago]);
  const detallesList    = useMemo(()=>Array.isArray(localLists.detalles)?localLists.detalles:[]           ,[localLists.detalles]);
  const proveedoresList = useMemo(()=>Array.isArray(localLists.proveedores)?localLists.proveedores:[]     ,[localLists.proveedores]);

  const [fecha,setFecha]             = useState(todayISO);
  const [forma,setForma]             = useState(NULL_OPTION);
  const [idProveedor,setIdProveedor] = useState(NULL_OPTION);
  const [provInput,setProvInput]     = useState("");
  const [rows,setRows]               = useState(()=>[buildEmptyRow()]);
  const [saving,setSaving]           = useState(false);
  const [archivoAdjunto,setArchivoAdjunto] = useState(null);
  const [addUI,setAddUI]             = useState({open:false,kind:null,rowId:null,text:"",saving:false});
  const [mediosFilas,setMediosFilas] = useState(()=>[buildEmptyMedioPago()]);
  const [mpModalOpen,setMpModalOpen] = useState(false);

  const closeBtnRef      = useRef(null);
  const prevOpenRef      = useRef(false);
  const fechaInputRef    = useRef(null);
  const rowsContainerRef = useRef(null);
  const fileInputRef     = useRef(null);

  const [openVerComp,setOpenVerComp] = useState(false);
  const [compUrl,setCompUrl]         = useState("");
  const [hasScroll,setHasScroll]     = useState(false);

  useEffect(()=>{
    const wasOpen=prevOpenRef.current; prevOpenRef.current=open;
    if(!open) return;
    if(!wasOpen&&open){
      setFecha(todayISO()); setForma(NULL_OPTION); setIdProveedor(NULL_OPTION); setProvInput("");
      setRows([buildEmptyRow()]); setMediosFilas([buildEmptyMedioPago()]);
      setAddUI({open:false,kind:null,rowId:null,text:"",saving:false});
      setSaving(false); setArchivoAdjunto(null); setMpModalOpen(false);
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

  useEffect(()=>{ if(isCorriente){ setMediosFilas([buildEmptyMedioPago()]); setMpModalOpen(false); } },[isCorriente]);

  const addRow    = useCallback(()=>setRows(p=>[...p,buildEmptyRow()]),[]);
  const removeRow = useCallback((id)=>setRows(p=>{ const n=p.filter(r=>r.id!==id); return n.length?n:p; }),[]);
  const updateRow = useCallback((id,patch)=>setRows(p=>p.map(r=>r.id===id?{...r,...patch}:r)),[]);

  const addMedioPago    = useCallback(()=>setMediosFilas(p=>[...p,buildEmptyMedioPago()]),[]);
  const removeMedioPago = useCallback((id)=>{
    setMediosFilas(prev=>{ const n=prev.filter(r=>r.id!==id); return n.length?n:[buildEmptyMedioPago()]; });
  },[]);
  const updateMedioPago = useCallback((id,patch)=>setMediosFilas(p=>p.map(r=>r.id===id?{...r,...patch}:r)),[]);

  const handleSeleccionarContado = useCallback(()=>{ setForma("CONTADO"); setMpModalOpen(true); },[]);

  const handleProveedorInputChange = useCallback((val)=>{ setProvInput(val); setIdProveedor(NULL_OPTION); },[]);
  const handleSelectProveedor      = useCallback((prov)=>{ setProvInput(String(prov?.nombre??"").trim()); setIdProveedor(getProveedorId(prov)!=null?String(getProveedorId(prov)):NULL_OPTION); },[]);

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

  const sumaMediosPago = useMemo(()=>mediosFilas.reduce((a,r)=>a+safeNumber(r.monto),0),[mediosFilas]);

  const handleOpenDate = useCallback((e)=>{
    if(saving) return;
    if(e){ e.preventDefault(); e.stopPropagation(); }
    const input=fechaInputRef.current; if(!input) return;
    input.focus();
    try { if(typeof input.showPicker==="function") input.showPicker(); else input.click(); } catch { input.click(); }
  },[saving]);

  const validate = useCallback(()=>{
    const provId=Number(idProveedor);
    if(!(Number.isFinite(provId)&&provId>0)) return { ok:false, msg:"Falta seleccionar un Proveedor válido de la lista." };
    if(!["CONTADO","CUENTA_CORRIENTE"].includes(String(forma))) return { ok:false, msg:"Falta seleccionar el Tipo de compra (Contado / Cuenta Corriente)." };
    if(isContado){
      for(let i=0;i<mediosFilas.length;i++){
        const mp=mediosFilas[i];
        if(!mp.id_medio_pago||mp.id_medio_pago===NULL_OPTION) return { ok:false, msg:`Medio de pago ${i+1}: falta seleccionar el medio.` };
        if(safeNumber(mp.monto)<=0) return { ok:false, msg:`Medio de pago ${i+1}: el monto debe ser mayor a 0.` };
        const mpRow=mediosPagoList.find(x=>String(getMedioPagoId(x)??"")===String(mp.id_medio_pago));
        const tipoCheque=normalizeChequeTipoFromMedio(mpRow?.nombre||"");
        if(tipoCheque!==null){
          const sel=Array.isArray(mp.id_cheque)?mp.id_cheque:mp.id_cheque?[String(mp.id_cheque)]:[];
          if(!sel.length) return { ok:false, msg:`Medio de pago ${i+1}: debés seleccionar al menos un ${tipoCheque==="echeq"?"eCheq":"cheque"} en cartera.` };
        }
      }
      if(sumaMediosPago<resumen.total-0.05&&resumen.total>0) return { ok:false, msg:`La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no cubre el total de la compra (${moneyARS(resumen.total)}).` };
    }
    const problems=[];
    rowsCalc.forEach((r,i)=>{ const p=describeLineProblem(r,i+1); if(p) problems.push(p); });
    const usable=rowsCalc.filter(r=>Number.isFinite(Number(r.id_detalle))&&Number(r.id_detalle)>0&&Number(r.total||0)>0);
    if(!usable.length){
      if(problems.length){ const msg=problems.slice(0,2).join(" "); const extra=problems.length>2?` (y ${problems.length-2} más)`:""; return { ok:false, msg:`No hay filas válidas. ${msg}${extra}` }; }
      return { ok:false, msg:"Cargá al menos 1 fila válida (Detalle + Cantidad + Precio)." };
    }
    return { ok:true, warn:problems.length>0 };
  },[idProveedor,forma,isContado,mediosFilas,mediosPagoList,rowsCalc,resumen.total,sumaMediosPago]);

  const subirYVincularArchivo = useCallback(async(idsMovimientos,archivo)=>{
    if(!archivo||!idsMovimientos?.length) return null;
    const fd=new FormData(); fd.append("archivo",archivo); fd.append("tipo","FACTURA"); fd.append("force","0"); fd.append("ids_movimiento",JSON.stringify(idsMovimientos));
    return await apiPostForm(API_UPLOAD_LINK,fd);
  },[API_UPLOAD_LINK]);

  const handleOpenFilePicker = useCallback(()=>{ if(saving) return; fileInputRef.current?.click(); },[saving]);

  const handleOpenVerComprobante = useCallback(()=>{
    if(!archivoAdjunto) return;
    const url=URL.createObjectURL(archivoAdjunto);
    setCompUrl(url); setOpenVerComp(true);
  },[archivoAdjunto]);

  const handleCloseVerComprobante = useCallback(()=>{
    setOpenVerComp(false);
    if(compUrl) URL.revokeObjectURL(compUrl);
    setCompUrl("");
  },[compUrl]);

  useEffect(()=>{ return()=>{ if(compUrl) URL.revokeObjectURL(compUrl); }; },[compUrl]);

  const submit = useCallback(async()=>{
    if(saving) return;
    const { sessionKey,token,idUsuario,idUsuarioMaster }=getAuthInfo();
    if(!sessionKey&&!token){ showToast("error","No hay sesión activa.",5200); return; }
    if(addUI.open){ showToast("advertencia","Terminá de crear (o cancelá) antes de guardar.",3200); return; }
    const v=validate();
    if(!v.ok){ showToast("advertencia",v.msg||"Faltan datos.",4200); return; }
    setSaving(true);
    if(v.warn) showToast("advertencia","Hay filas incompletas: se guardarán solo las válidas.",3600);
    try {
      const idTipoVenta=isCorriente?2:1;
      const accionFinal=isCorriente?"guardar":"pagar";
      const esPagadaFinal=!isCorriente;
      const proveedorIdFinal=Number(idProveedor)>0?Number(idProveedor):null;

      const mediosPagoPayload=isContado?mediosFilas.flatMap(mp=>{
        const chequesSeleccionados=Array.isArray(mp.id_cheque)?mp.id_cheque:mp.id_cheque?[String(mp.id_cheque)]:[];
        const mpRow=mediosPagoList.find(x=>String(getMedioPagoId(x)??"")===String(mp.id_medio_pago));
        const tipoCheque=normalizeChequeTipoFromMedio(mpRow?.nombre||"");
        if(tipoCheque!==null&&chequesSeleccionados.length>0){
          return chequesSeleccionados.map(idChequeStr=>{
            const ch=mp.chequesDisponibles?.find(x=>String(x.id_cheque)===String(idChequeStr));
            return { id_medio_pago:Number(mp.id_medio_pago), monto:Number(ch?.importe||0), id_cheque:Number(idChequeStr) };
          });
        }
        return [{ id_medio_pago:Number(mp.id_medio_pago), monto:safeNumber(mp.monto) }];
      }):[];

      const payloads=rowsCalc.filter(r=>Number.isFinite(Number(r.id_detalle))&&Number(r.id_detalle)>0&&Number(r.total||0)>0).map(r=>({
        idUsuario,idUsuarioMaster,fecha,id_tipo_venta:idTipoVenta,id_proveedor:proveedorIdFinal,
        proveedor_nombre:String(provInput||"").trim()||null,
        id_detalle:Number(r.id_detalle),id_stock_producto:Number(r.id_detalle),
        cantidad:Math.round(Number(r.cantidad)*100)/100,precio:Math.round(Number(r.precio)*100)/100,
        iva_pct:Math.round(Number(r.ivaPct)*100)/100,subtotal:Math.round(Number(r.subtotal)*100)/100,
        iva_monto:Math.round(Number(r.ivaMonto)*100)/100,total:Math.round(Number(r.total)*100)/100,
        monto_total:Math.round(Number(r.total)*100)/100,accion_compra:accionFinal,es_pagada:esPagadaFinal,
      }));

      if(!payloads.length){ showToast("advertencia","No hay filas válidas para guardar.",4200); setSaving(false); return; }

      const data=await apiPostJson(API_BATCH,{ idUsuario,idUsuarioMaster,items:payloads,medios_pago:mediosPagoPayload });
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
      <div className="mi-modal__overlay">
        <div className="mi-modal__container mi-modal__container--mov" role="dialog" aria-modal="true" onMouseDown={(e)=>e.stopPropagation()}>

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

                <div ref={rowsContainerRef} className={`mi-cr-table__rows${hasScroll?" has-scroll":""}`}>
                  {rowsCalc.map(r=>{
                    const stockNum=r.stock_disponible!==null&&r.stock_disponible!==undefined?Number(r.stock_disponible):null;
                    const rowSinStock=r.sinStock||isSinStock(stockNum);
                    return (
                      <div key={r.id} className={`mi-cr-row${rowSinStock?" mi-cr-row--sin-stock":""}`}>
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
                            style={{
                              width:"100%",
                              background:rowSinStock?"#f3f4f6":undefined,
                              color:rowSinStock?"#b91c1c":undefined,
                              borderColor:rowSinStock?"#fca5a5":undefined,
                              cursor:rowSinStock?"not-allowed":undefined,
                              opacity:rowSinStock?0.9:1
                            }}
                          />
                          {r.stock_disponible!==null&&r.stock_disponible!==undefined&&(
                            <div style={{fontSize:"10px",fontWeight:rowSinStock?700:500,color:rowSinStock?"#b91c1c":"#666"}}>
                              {rowSinStock?"Sin stock":`Stock: ${r.stock_disponible}`}
                            </div>
                          )}
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <input className="nv-cell-input nv-cell-input--right" type="text"
                            value={formatMoneyInputARS(r.precio)} readOnly tabIndex={-1}
                            style={{width:"100%",pointerEvents:"none",background:"transparent",cursor:"default"}}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <select className="nv-cell-input nv-cell-input--center nv-cell-input--select"
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
              <aside className="nc-aside">

                {/* Datos de compra */}
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot"/>
                    <span>Datos de compra</span>
                  </div>
                  <div className="nc-section-body">

                    {/* Fecha */}
                    <div className="nc-field" onClick={handleOpenDate}>
                      <input ref={fechaInputRef} className="nc-input" type="date" placeholder=" "
                        value={fecha} onChange={(e)=>setFecha(String(e.target.value||"").trim())} disabled={saving}
                      />
                      <label className="nc-label" onClick={handleOpenDate}>Fecha</label>
                    </div>

                    {/* Proveedor */}
                    <div className="nc-prov-wrap">
                      <GlobalAutocomplete
                        value={provInput}
                        onChange={handleProveedorInputChange}
                        onSelect={handleSelectProveedor}
                        options={proveedoresList}
                        getOptionLabel={(p)=>String(p?.nombre??"").trim()}
                        getOptionValue={(p)=>String(getProveedorId(p)??p?.nombre??"")}
                        label="Proveedor *"
                        placeholder=" "
                        disabled={saving||addUI.open}
                        showAllOnFocus={true}
                        maxItems={25}
                        inputClassName="nc-input"
                      />
                    </div>

                    {/* Tipo compra */}
                    <div>
                      <div className="nc-pill-label">Tipo *</div>
                      <div className="nc-pills">
                        <button type="button" className={`nc-pill${isContado?" nc-pill--active":""}`} onClick={handleSeleccionarContado} disabled={saving}>Contado</button>
                        <button type="button" className={`nc-pill${isCorriente?" nc-pill--active":""}`} onClick={()=>setForma("CUENTA_CORRIENTE")} disabled={saving}>Cuenta Corriente</button>
                      </div>
                    </div>

                    {/* Resumen medios pago */}
                    {isContado && (
                      <>
                        <PagoResumenPanel mediosFilas={mediosFilas} mediosPagoList={mediosPagoList} totalCompra={resumen.total} onEdit={()=>setMpModalOpen(true)}/>
                        {!mediosFilas.some(r=>r.id_medio_pago&&r.id_medio_pago!=="")&&(
                          <button type="button" className="nc-pago-btn" onClick={()=>setMpModalOpen(true)} disabled={saving}>
                            <FontAwesomeIcon icon={faCreditCard} style={{fontSize:12}}/>
                            Configurar medios de pago
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Cuenta corriente */}
                {isCorriente&&(
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" style={{background:"#d97706"}}/>
                      <span>Cuenta Corriente</span>
                    </div>
                    <div className="nc-section-body">
                      <div className="nc-cc-info">Quedará registrada como <b>pendiente de pago</b>.</div>
                    </div>
                  </div>
                )}

                {/* Comprobante */}
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" style={{background:"#64748b"}}/>
                    <span>Comprobante adjunto</span>
                  </div>
                  <div className="nc-section-body">
                    <div className="mi-uploadCard">
                      <div className="mi-uploadCard__head">
                        <div className="mi-uploadCard__title">Comprobante</div>
                        <div className="mi-uploadCard__sub">Seleccioná, visualizá o quitá el archivo antes de guardar</div>
                      </div>
                      <div className="mi-uploadCard__body">
                        <div className={`mi-uploadFile${archivoAdjunto?" is-filled":" is-empty"}`}>
                          {archivoAdjunto?(
                            <>
                              <div className="mi-uploadFile__icon"><FontAwesomeIcon icon={faFileInvoiceDollar}/></div>
                              <div className="mi-uploadFile__meta">
                                <div className="mi-uploadFile__name" title={archivoAdjunto.name}>{archivoAdjunto.name}</div>
                                <div className="mi-uploadFile__size">{Math.max(1,Math.round((archivoAdjunto.size||0)/1024))} KB</div>
                              </div>
                              <div style={{display:"flex",gap:8,marginLeft:"auto",flexWrap:"wrap"}}>
                                <button type="button" className="mi-uploadBar__btn mi-uploadBar__btn--ghost" onClick={handleOpenVerComprobante} disabled={saving} title="Ver comprobante"><FontAwesomeIcon icon={faEye}/></button>
                                <button type="button" className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                  onClick={()=>{ setArchivoAdjunto(null); if(fileInputRef.current) fileInputRef.current.value=""; setOpenVerComp(false); if(compUrl) URL.revokeObjectURL(compUrl); setCompUrl(""); }}
                                  disabled={saving||openVerComp} title="Quitar archivo"><FontAwesomeIcon icon={faTrash}/></button>
                              </div>
                            </>
                          ):(
                            <div className="mi-uploadFile__empty">No hay comprobante seleccionado</div>
                          )}
                        </div>
                        <div className="mi-uploadBar" style={{marginTop:10}}>
                          <input ref={fileInputRef} type="file" className="mi-uploadBar__input" onChange={(e)=>setArchivoAdjunto(e.target.files?.[0]||null)} disabled={saving} style={{display:"none"}}/>
                          <button type="button" className="mi-uploadBar__btn mi-uploadBar__btn--primary" onClick={handleOpenFilePicker} disabled={saving}>
                            <FontAwesomeIcon icon={faUpload}/>{" "}{archivoAdjunto?"Reemplazar archivo":"Seleccionar archivo"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="nc-actions mi-cr-filters__actions">
                  <button type="button" className="mit-btn mit-btn--solid mit-btn--block" onClick={submit} disabled={saving}>{saving?"Guardando...":"Guardar compra"}</button>
                  <button type="button" className="mit-btn mit-btn--ghost mit-btn--block" onClick={()=>!saving&&onClose?.()} disabled={saving}>Cancelar</button>
                </div>

              </aside>
            </div>
          </div>

          <AddCatalogMiniModal
            open={addUI.open}
            title={addUI.kind==="proveedores"?"Nuevo proveedor":"Nuevo detalle"}
            value={addUI.text} saving={addUI.saving}
            onChange={(txt)=>setAddUI(p=>({...p,text:txt}))}
            onCancel={closeAddMini} onSave={guardarNuevoCatalogo}
          />
        </div>
      </div>

      {/* Mini-modal medios de pago */}
      <ModalMediosPago
        open={mpModalOpen}
        mediosPagoList={mediosPagoList}
        totalCompra={resumen.total}
        mediosFilas={mediosFilas}
        onUpdate={updateMedioPago}
        onAdd={addMedioPago}
        onRemove={removeMedioPago}
        onClose={()=>setMpModalOpen(false)}
        onConfirm={()=>setMpModalOpen(false)}
        apiGet={apiGet}
        BASE_URL={BASE_URL}
        showToast={showToast}
      />

      <ModalVerComprobante
        open={openVerComp}
        url={compUrl}
        mime={archivoAdjunto?.type||""}
        fileName={archivoAdjunto?.name||""}
        onClose={handleCloseVerComprobante}
        title="Comprobante de compra"
      />
    </>,
    document.body
  );
}