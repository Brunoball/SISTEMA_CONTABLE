import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyCheckDollar,
  faCircleInfo,
  faMagnifyingGlass,
  faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";

export default function Facturas() {
  return (
    <div className="doccom-subpage">
      <section className="mov-card mov-card--table doccom-emptyCard">
        <div className="mov-card__head doccom-emptyHead">
          <div className="mov-card__headLeft">
            <div className="title-mov">
              <div className="mov-card__title">Facturas</div>
              <div className="mov-card__hint">
                Sección preparada para listar facturas emitidas, no emitidas y sus
                comprobantes asociados.
              </div>
            </div>
          </div>
        </div>

        <div className="doccom-placeholder">
          <div className="doccom-placeholder__icon">
            <FontAwesomeIcon icon={faMoneyCheckDollar} />
          </div>

          <div className="doccom-placeholder__body">
            <h3>Facturas</h3>
            <p>
              El archivo de la sección ya está separado para conectar acá el
              listado de facturas del módulo de ventas.
            </p>

            <div className="doccom-placeholder__grid" aria-label="Columnas preparadas">
              <span>
                <FontAwesomeIcon icon={faMagnifyingGlass} /> Cliente / razón social
              </span>
              <span>
                <FontAwesomeIcon icon={faCircleInfo} /> Tipo y estado fiscal
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
