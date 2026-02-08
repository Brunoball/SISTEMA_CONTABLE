import React from "react";
import "./gif_carga.css";
import balto from "../../imagenes/balto_transparente.gif";

const GifCarga = () => {
  return (
    <div className="balto-loading-overlay">
      <div className="balto-loading-container">
        <img src={balto} alt="Cargando..." className="balto-loading-img" />
        <p className="balto-loading-text">Cargando información...</p>
      </div>
    </div>
  );
};

export default GifCarga;
