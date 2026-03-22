import React from "react";

const Inventario = () => {
  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ marginBottom: "10px" }}>Inventario</h1>
      <p>Sección básica de inventario de stock.</p>

      <div
        style={{
          marginTop: "20px",
          padding: "20px",
          borderRadius: "12px",
          background: "#fff",
          boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
        }}
      >
        <h3>Contenido inicial</h3>
        <p>Acá después vamos a trabajar el control de existencias.</p>
      </div>
    </div>
  );
};

export default Inventario;