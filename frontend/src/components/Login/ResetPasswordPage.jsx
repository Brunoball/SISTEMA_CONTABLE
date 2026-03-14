import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ModalReestablecerContra from "./modales/ModalReestablecerContra";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get("token") || "";

  return (
    <ModalReestablecerContra
      token={token}
      onClose={() => navigate("/", { replace: true })}
    />
  );
};

export default ResetPasswordPage;