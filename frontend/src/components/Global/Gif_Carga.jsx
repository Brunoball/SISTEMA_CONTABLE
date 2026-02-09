// src/components/Global/Gif_Carga.jsx
import React from "react";
import "./gif_carga.css";
import balto from "../../imagenes/balto_transparente.gif";

export default function GifCarga() {
  return (
    <div className="balto-loading-overlay">
      <div className="balto-loading-container">
        <img
          src={balto}
          alt="Cargando..."
          className="balto-loading-img"
        />
        <p className="balto-loading-text">
          Cargando información
        </p>
      </div>
    </div>
  );
}
