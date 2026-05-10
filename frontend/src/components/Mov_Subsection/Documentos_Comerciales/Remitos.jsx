import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxesStacked,
  faCircleInfo,
  faMagnifyingGlass,
  faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";

export default function Remitos() {
  return (
    <div className="doccom-subpage">
      <section className="mov-card mov-card--table doccom-emptyCard">
        <div className="mov-card__head doccom-emptyHead">
          <div className="mov-card__headLeft">
            <div className="title-mov">
              <div className="mov-card__title">Remitos</div>
              <div className="mov-card__hint">
                Sección preparada para listar remitos generados desde ventas y
                presupuestos convertidos.
              </div>
            </div>
          </div>
        </div>

        <div className="doccom-placeholder">
          <div className="doccom-placeholder__icon">
            <FontAwesomeIcon icon={faBoxesStacked} />
          </div>

          <div className="doccom-placeholder__body">
            <h3>Remitos</h3>
            <p>
              El archivo de la sección ya está separado para conectar acá el
              listado de remitos generados por cada venta.
            </p>

            <div className="doccom-placeholder__grid" aria-label="Columnas preparadas">
              <span>
                <FontAwesomeIcon icon={faMagnifyingGlass} /> Cliente / venta relacionada
              </span>
              <span>
                <FontAwesomeIcon icon={faCircleInfo} /> Origen del remito
              </span>
              <span>
                <FontAwesomeIcon icon={faBoxOpen} /> PDF / comprobante
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
