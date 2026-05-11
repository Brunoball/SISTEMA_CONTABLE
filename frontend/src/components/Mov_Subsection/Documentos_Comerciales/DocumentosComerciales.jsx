import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faMoneyCheckDollar,
  faBoxesStacked,
} from "@fortawesome/free-solid-svg-icons";

import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/roots.css";
import "../../Global/Global_css/Global_oscuro.css";
import "./DocumentosComerciales.css";

import Presupuestos from "./Presupuestos.jsx";
import Facturas from "./Facturas.jsx";
import Remitos from "./Remitos.jsx";

const TABS = [
  {
    key: "presupuesto",
    label: "Presupuestos",
    hint: "Presupuestos",
    icon: faCheckCircle,
    component: Presupuestos,
  },
  {
    key: "facturas",
    label: "Facturas",
    hint: "Emitidas y no emitidas",
    icon: faMoneyCheckDollar,
    component: Facturas,
  },
  {
    key: "remitos",
    label: "Remitos",
    hint: "Comprobantes de entrega",
    icon: faBoxesStacked,
    component: Remitos,
  },
];

function getTabFromSearch(search) {
  const params = new URLSearchParams(search || "");
  const tab = String(params.get("tab") || "").trim().toLowerCase();
  return TABS.some((item) => item.key === tab) ? tab : TABS[0].key;
}

export default function DocumentosComerciales() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(
    () => getTabFromSearch(location.search),
    [location.search]
  );

  const activeItem = useMemo(
    () => TABS.find((item) => item.key === activeTab) || TABS[0],
    [activeTab]
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const rawTab = String(params.get("tab") || "").trim().toLowerCase();

    if (!rawTab || !TABS.some((item) => item.key === rawTab)) {
      params.set("tab", TABS[0].key);
      navigate(
        {
          pathname: location.pathname,
          search: `?${params.toString()}`,
        },
        { replace: true }
      );
    }
  }, [location.pathname, location.search, navigate]);

  const handleTabClick = (tabKey) => {
    const params = new URLSearchParams(location.search || "");
    params.set("tab", tabKey);

    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
      },
      { replace: false }
    );
  };

  const ActiveComponent = activeItem.component;

  const navigationTabs = (
    <div className="doccom-googleTabs" role="tablist" aria-label="Pestañas de documentos comerciales">
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;

        return (
          <button
            key={tab.key}
            type="button"
            className={`doccom-googleTab ${isActive ? "is-active" : ""}`}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleTabClick(tab.key)}
          >

            <span className="doccom-googleTab__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="doccom-page">
      <ActiveComponent navigationTabs={navigationTabs} />
    </div>
  );
}
