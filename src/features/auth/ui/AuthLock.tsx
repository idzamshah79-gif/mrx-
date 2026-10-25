import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import AppFrame from "@/features/navigation/ui/AppFrame";
import { useWindowState } from "@/features/navigation/hooks/useWindowState";

export function AuthLock({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const initialize = useAuthStore((state) => state.initialize);
  useWindowState();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (pathname === "/login") {
      navigate("/", { replace: true });
    }
  }, [pathname, navigate]);

  return <AppFrame>{children}</AppFrame>;
}

export default AuthLock;
