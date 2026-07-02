import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AdminDashboard } from "./screens/Admin";

const isAdmin = location.pathname === "/admin";
createRoot(document.getElementById("root")!).render(
  isAdmin ? <AdminDashboard /> : <App />,
);
